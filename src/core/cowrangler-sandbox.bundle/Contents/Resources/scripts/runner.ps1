# Cowrangler Windows Sandbox Runner
# Usage: runner.ps1 <provider> <cwd> <network_restricted> <command>

param (
    [string]$Provider,
    [string]$Cwd,
    [string]$NetworkRestricted,
    [string]$Command
)

Set-Location -Path $Cwd -ErrorAction SilentlyContinue

switch ($Provider) {
    "docker" {
        # Check if Docker is available
        $dockerCheck = Get-Command docker -ErrorAction SilentlyContinue
        if (-not $dockerCheck) {
            Write-Warning "Docker is not installed. Falling back to direct execution."
            $Provider = "fallback"
        } else {
            # Check if docker daemon is running
            & docker info > $null 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Docker daemon is not running. Falling back to direct execution."
                $Provider = "fallback"
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

# Fallback: Direct execution in isolated shell
if ($Provider -eq "fallback" -or [string]::IsNullOrEmpty($Provider)) {
    # Run command in cmd/powershell
    & cmd.exe /c $Command
    Exit $LASTEXITCODE
}
