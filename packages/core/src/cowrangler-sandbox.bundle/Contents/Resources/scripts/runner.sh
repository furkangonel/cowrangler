#!/bin/bash
# Cowrangler Sandbox Runner for macOS and Linux
# Usage: runner.sh <provider> <cwd> <network_restricted> <command...>

PROVIDER=$1
CWD=$2
NETWORK_RESTRICTED=$3
CMD=$4

unavailable() {
  echo "SANDBOX UNAVAILABLE: $1" >&2
  exit 125
}

case $PROVIDER in
  "mac_seatbelt")
    # Check if sandbox-exec is available
    if ! command -v sandbox-exec >/dev/null 2>&1; then
      unavailable "sandbox-exec disappeared after backend detection. Command was not run."
    else
      # Generate dynamic seatbelt profile.
      # NOTE: BSD mktemp (macOS) requires the template to END in X's, so the
      # ".sb" suffix must not follow XXXXXX. sandbox-exec -f accepts any path.
      PROFILE_FILE=$(mktemp "${TMPDIR:-/tmp}/cowrangler_sb_XXXXXX") || unavailable "Could not create temporary Seatbelt profile."
      # Escape values inserted into Seatbelt string literals.
      PROFILE_CWD=${CWD//\\/\\\\}
      PROFILE_CWD=${PROFILE_CWD//\"/\\\"}
      PROFILE_HOME=${HOME//\\/\\\\}
      PROFILE_HOME=${PROFILE_HOME//\"/\\\"}
      cat <<EOF > "$PROFILE_FILE"
(version 1)
(deny default)
(allow process-fork)
(allow process-exec)
(allow sysctl-read)
(allow file-read* (literal "/"))
(allow file-read* (literal "/Users"))
(allow file-read* (subpath "/usr/lib"))
(allow file-read* (subpath "/usr/share"))
(allow file-read* (subpath "/System/Library"))
(allow file-read* (subpath "/private/var"))
(allow file-read* (subpath "/usr/bin"))
(allow file-read* (subpath "/bin"))
(allow file-read* (subpath "/sbin"))
(allow file-read* (subpath "/etc"))
(allow file-read* (subpath "/var"))
(allow file-read* (subpath "/opt"))
(allow file-read* (subpath "/private/var/folders"))
(allow file-write* (subpath "/private/var/folders"))
(allow file-read* (subpath "/tmp"))
(allow file-write* (subpath "/tmp"))
(allow file-read* (subpath "/private/tmp"))
(allow file-write* (subpath "/private/tmp"))
(allow file-read* (subpath "$PROFILE_CWD"))
(allow file-write* (subpath "$PROFILE_CWD"))
(allow file-read* (subpath "/dev"))
(allow file-write* (literal "/dev/null"))
(allow file-write* (literal "/dev/zero"))
EOF

      # Allow home directory read access for tools configuration (e.g. .npmrc, .gitconfig) but write only to project path
      if [ -d "$HOME" ]; then
        echo "(allow file-read* (subpath \"$PROFILE_HOME\"))" >> "$PROFILE_FILE"
        # Commands must not read credentials or rewrite the files that decide
        # their own permissions. Specific denies override broad config reads.
        echo "(deny file-read* (subpath \"$PROFILE_HOME/.ssh\"))" >> "$PROFILE_FILE"
        echo "(deny file-read* (subpath \"$PROFILE_HOME/.aws\"))" >> "$PROFILE_FILE"
        echo "(deny file-read* (subpath \"$PROFILE_HOME/.gnupg\"))" >> "$PROFILE_FILE"
        echo "(deny file-write* (subpath \"$PROFILE_HOME/.cowrangler\"))" >> "$PROFILE_FILE"
      fi

      # Keep workspace code writable while preventing a sandboxed command from
      # granting itself more power on the next run.
      echo "(deny file-write* (literal \"$PROFILE_CWD/.git/config\"))" >> "$PROFILE_FILE"
      echo "(deny file-write* (subpath \"$PROFILE_CWD/.git/hooks\"))" >> "$PROFILE_FILE"
      echo "(deny file-write* (literal \"$PROFILE_CWD/.cowrangler/settings.json\"))" >> "$PROFILE_FILE"
      echo "(deny file-write* (literal \"$PROFILE_CWD/.cowrangler/settings.local.json\"))" >> "$PROFILE_FILE"
      echo "(deny file-write* (literal \"$PROFILE_CWD/.cowrangler/config.yaml\"))" >> "$PROFILE_FILE"

      if [ "$NETWORK_RESTRICTED" = "false" ]; then
        echo "(allow network-outbound)" >> "$PROFILE_FILE"
        echo "(allow system-socket)" >> "$PROFILE_FILE"
      fi

      # Run command inside seatbelt sandbox
      cd "$CWD" || exit 1
      sandbox-exec -f "$PROFILE_FILE" /bin/bash -c "$CMD"
      EXIT_CODE=$?
      rm -f "$PROFILE_FILE"
      exit $EXIT_CODE
    fi
    ;;

  "linux_bwrap")
    if ! command -v bwrap >/dev/null 2>&1; then
      unavailable "Bubblewrap disappeared after backend detection. Command was not run."
    else
      # Build bubblewrap flags
      BWRAP_ARGS=()
      
      # Bind basic OS directories read-only
      [ -d "/usr" ] && BWRAP_ARGS+=("--ro-bind" "/usr" "/usr")
      [ -d "/lib" ] && BWRAP_ARGS+=("--ro-bind" "/lib" "/lib")
      [ -d "/lib64" ] && BWRAP_ARGS+=("--ro-bind" "/lib64" "/lib64")
      [ -d "/bin" ] && BWRAP_ARGS+=("--ro-bind" "/bin" "/bin")
      [ -d "/sbin" ] && BWRAP_ARGS+=("--ro-bind" "/sbin" "/sbin")
      [ -d "/etc" ] && BWRAP_ARGS+=("--ro-bind" "/etc" "/etc")
      
      # Setup writeable paths
      BWRAP_ARGS+=("--dir" "/tmp" "--bind" "/tmp" "/tmp")
      [ -d "/proc" ] && BWRAP_ARGS+=("--proc" "/proc")
      [ -d "/dev" ] && BWRAP_ARGS+=("--dev" "/dev")
      
      # Bind project working directory as writeable
      BWRAP_ARGS+=("--bind" "$CWD" "$CWD")
      
      # Network restriction flag
      if [ "$NETWORK_RESTRICTED" = "true" ]; then
        BWRAP_ARGS+=("--unshare-net")
      fi

      # Execute
      cd "$CWD" || exit 1
      bwrap "${BWRAP_ARGS[@]}" --chdir "$CWD" /bin/bash -c "$CMD"
      exit $?
    fi
    ;;

  "linux_firejail")
    if ! command -v firejail >/dev/null 2>&1; then
      unavailable "Firejail disappeared after backend detection. Command was not run."
    else
      # Restrict filesystem to the project dir; keep /tmp private.
      FIREJAIL_ARGS=("--quiet" "--private-tmp" "--whitelist=$CWD")
      if [ "$NETWORK_RESTRICTED" = "true" ]; then
        FIREJAIL_ARGS+=("--net=none")
      fi
      cd "$CWD" || exit 1
      firejail "${FIREJAIL_ARGS[@]}" /bin/bash -c "$CMD"
      exit $?
    fi
    ;;

  "docker")
    # Run command inside a Docker container
    if ! command -v docker >/dev/null 2>&1; then
      unavailable "Docker disappeared after backend detection. Command was not run."
    elif ! docker info >/dev/null 2>&1; then
      unavailable "Docker daemon stopped after backend detection. Command was not run."
    else
      NET_FLAG=""
      if [ "$NETWORK_RESTRICTED" = "true" ]; then
        NET_FLAG="--network none"
      fi
      # Run in a node/npm-ready alpine container
      docker run --rm $NET_FLAG -v "$CWD":"/workspace" -w "/workspace" node:20-alpine /bin/sh -c "$CMD"
      exit $?
    fi
    ;;
esac

# Direct execution is handled by sandbox.ts only after explicit permission.
# Reaching this branch means an invalid/raced provider, never permission.
unavailable "Unknown isolation provider '$PROVIDER'. Command was not run."
