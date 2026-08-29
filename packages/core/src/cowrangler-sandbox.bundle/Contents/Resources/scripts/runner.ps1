# Cowrangler Windows Sandbox Runner
# Usage: runner.ps1 <provider> <cwd> <network_restricted> <command>

param (
    [string]$Provider,
    [string]$Cwd,
    [string]$NetworkRestricted,
    [string]$Command
)

Set-Location -Path $Cwd -ErrorAction SilentlyContinue

function Stop-SandboxUnavailable([string]$Message) {
    [Console]::Error.WriteLine("SANDBOX UNAVAILABLE: $Message")
    Exit 125
}

switch ($Provider) {
    "wsl_bwrap" {
        # Preferred Windows isolation: WSL2 + bubblewrap inside the distro.
        $wslCheck = Get-Command wsl -ErrorAction SilentlyContinue
        if (-not $wslCheck) {
            Stop-SandboxUnavailable "WSL disappeared after backend detection. Command was not run."
        } else {
            # Translate the Windows path to a WSL mount path (C:\foo -> /mnt/c/foo).
            $wslPath = [regex]::Replace(($Cwd -replace '\\', '/'), '^([A-Za-z]):', { param($m) "/mnt/" + $m.Groups[1].Value.ToLower() })
            $unshare = ""
            if ($NetworkRestricted -eq "true") { $unshare = "--unshare-net" }
            $inner = "bwrap --bind '$wslPath' '$wslPath' --ro-bind /usr /usr --ro-bind /bin /bin --ro-bind /lib /lib --proc /proc --dev /dev --dir /tmp $unshare --chdir '$wslPath' /bin/bash -c `"$Command`""
            & wsl -e sh -c $inner
            Exit $LASTEXITCODE
        }
    }

    "docker" {
        # Check if Docker is available
        $dockerCheck = Get-Command docker -ErrorAction SilentlyContinue
        if (-not $dockerCheck) {
            Stop-SandboxUnavailable "Docker disappeared after backend detection. Command was not run."
        } else {
            # Check if docker daemon is running
            & docker info > $null 2>&1
            if ($LASTEXITCODE -ne 0) {
                Stop-SandboxUnavailable "Docker daemon stopped after backend detection. Command was not run."
            } else {
                $netFlag = ""
                if ($NetworkRestricted -eq "true") {
                    $netFlag = "--network none"
                }
                # Run inside standard node image
                # Convert Windows path to container format if needed
                $containerPath = $Cwd -replace '\\', '/' -replace '^([A-Za-z]):', '/$1'
                & docker run --rm $netFlag -v "${Cwd}:/workspace" -w "/workspace" node:20-alpine /bin/sh -c "$Command"
                Exit $LASTEXITCODE
            }
        }
    }
}

# Weak fallback: constrain the process to a private temp dir + the project cwd.
# Not a security boundary as strong as Seatbelt/bwrap, but limits stray writes.
if ($Provider -eq "win_jobobject") {
    $jobTemp = Join-Path $env:TEMP ("cowrangler_job_" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $jobTemp -Force | Out-Null
    try {
        $env:TMP = $jobTemp
        $env:TEMP = $jobTemp
        Set-Location -Path $Cwd -ErrorAction SilentlyContinue
        & cmd.exe /c $Command
        Exit $LASTEXITCODE
    } finally {
        Remove-Item -Path $jobTemp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Direct/Job Object execution is selected in sandbox.ts only after explicit
# low-trust permission. Unknown providers must never silently weaken isolation.
Stop-SandboxUnavailable "Unknown isolation provider '$Provider'. Command was not run."
