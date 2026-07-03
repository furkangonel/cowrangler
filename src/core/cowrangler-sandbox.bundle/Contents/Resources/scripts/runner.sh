#!/bin/bash
# Cowrangler Sandbox Runner for macOS and Linux
# Usage: runner.sh <provider> <cwd> <network_restricted> <command...>

PROVIDER=$1
CWD=$2
NETWORK_RESTRICTED=$3
shift 3
CMD="$@"

case $PROVIDER in
  "mac_seatbelt")
    # Check if sandbox-exec is available
    if ! command -v sandbox-exec >/dev/null 2>&1; then
      echo "sandbox-exec is not available on this system. Falling back to direct execution." >&2
      PROVIDER="fallback"
    else
      # Generate dynamic seatbelt profile.
      # NOTE: BSD mktemp (macOS) requires the template to END in X's, so the
      # ".sb" suffix must not follow XXXXXX. sandbox-exec -f accepts any path.
      PROFILE_FILE=$(mktemp "${TMPDIR:-/tmp}/cowrangler_sb_XXXXXX")
      cat <<EOF > "$PROFILE_FILE"
(version 1)
(deny default)
(allow process-fork)
(allow process-exec)
(allow sysctl-read)
(allow file-read* (literal "/"))
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
(allow file-read* (subpath "$CWD"))
(allow file-write* (subpath "$CWD"))
EOF

      # Allow home directory read access for tools configuration (e.g. .npmrc, .gitconfig) but write only to project path
      if [ -d "$HOME" ]; then
        echo "(allow file-read* (subpath \"$HOME\"))" >> "$PROFILE_FILE"
        # Allow writing to app config/data directory inside home
        echo "(allow file-read* (subpath \"$HOME/.cowrangler\"))" >> "$PROFILE_FILE"
        echo "(allow file-write* (subpath \"$HOME/.cowrangler\"))" >> "$PROFILE_FILE"
      fi

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
      echo "Bubblewrap (bwrap) is not installed. Falling back to direct execution." >&2
      PROVIDER="fallback"
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
      echo "Firejail is not installed. Falling back to direct execution." >&2
      PROVIDER="fallback"
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
      echo "Docker is not installed. Falling back to direct execution." >&2
      PROVIDER="fallback"
    elif ! docker info >/dev/null 2>&1; then
      echo "Docker daemon is not running. Falling back to direct execution." >&2
      PROVIDER="fallback"
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

# Fallback to direct execution (Runs asynchronously outside sandbox)
if [ "$PROVIDER" = "fallback" ] || [ -z "$PROVIDER" ]; then
  cd "$CWD" || exit 1
  /bin/bash -c "$CMD"
  exit $?
fi
