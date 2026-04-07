#!/usr/bin/env bash
set -euo pipefail

REPO="${AGENT_STUDIO_REPO:-harishkotra/local-agent-studio}"
VERSION="${AGENT_STUDIO_VERSION:-latest}"
INSTALL_ROOT="${AGENT_STUDIO_INSTALL_ROOT:-$HOME/.local/share/agent-studio}"
BIN_DIR="${AGENT_STUDIO_BIN_DIR:-$HOME/.local/bin}"

usage() {
  cat <<'EOF'
Usage: install.sh [--version <tag>] [--repo <owner/name>] [--install-dir <dir>] [--bin-dir <dir>] [--uninstall]

Examples:
  curl -fsSL https://raw.githubusercontent.com/harishkotra/local-agent-studio/main/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/harishkotra/local-agent-studio/main/install.sh | bash -s -- --version v0.1.0
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

detect_os() {
  case "$(uname -s)" in
    Linux) echo "linux" ;;
    Darwin) echo "darwin" ;;
    *)
      echo "Unsupported operating system: $(uname -s)" >&2
      exit 1
      ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    arm64|aarch64) echo "arm64" ;;
    *)
      echo "Unsupported architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac
}

resolve_latest_version() {
  curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
}

download() {
  local url="$1"
  local output="$2"
  curl -fsSL "$url" -o "$output"
}

checksum_file() {
  local file="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    sha256sum "$file" | awk '{print $1}'
  fi
}

install_launcher() {
  mkdir -p "$BIN_DIR"
  cat > "$BIN_DIR/agent-studio" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="${AGENT_STUDIO_INSTALL_ROOT:-$HOME/.local/share/agent-studio}"
APP_ROOT="$INSTALL_ROOT/current"

if [ ! -d "$APP_ROOT" ]; then
  echo "Agent Studio is not installed. Re-run the installer." >&2
  exit 1
fi

if [ -f "$APP_ROOT/apps/web/server.js" ]; then
  SERVER_PATH="$APP_ROOT/apps/web/server.js"
elif [ -f "$APP_ROOT/server.js" ]; then
  SERVER_PATH="$APP_ROOT/server.js"
else
  echo "Unable to find the packaged server entrypoint." >&2
  exit 1
fi

PID_FILE="$INSTALL_ROOT/agent-studio.pid"
LOG_DIR="$INSTALL_ROOT/logs"
LOG_FILE="$LOG_DIR/agent-studio.log"

start_background() {
  mkdir -p "$LOG_DIR"
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Agent Studio is already running with PID $(cat "$PID_FILE")." >&2
    exit 1
  fi
  nohup env HOST="${HOST:-127.0.0.1}" PORT="${PORT:-3000}" node "$SERVER_PATH" >>"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "Agent Studio started in background on http://${HOST:-127.0.0.1}:${PORT:-3000}"
}

stop_background() {
  if [ ! -f "$PID_FILE" ]; then
    echo "Agent Studio is not running."
    return
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "Stopped Agent Studio (PID $pid)."
  else
    echo "Removing stale PID file."
  fi
  rm -f "$PID_FILE"
}

case "${1:-start}" in
  start)
    shift || true
    exec env HOST="${HOST:-127.0.0.1}" PORT="${PORT:-3000}" node "$SERVER_PATH" "$@"
    ;;
  background)
    start_background
    ;;
  stop)
    stop_background
    ;;
  status)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "running $(cat "$PID_FILE")"
    else
      echo "stopped"
    fi
    ;;
  logs)
    mkdir -p "$LOG_DIR"
    touch "$LOG_FILE"
    exec tail -f "$LOG_FILE"
    ;;
  *)
    echo "Usage: agent-studio [start|background|stop|status|logs]" >&2
    exit 1
    ;;
esac
EOF
  chmod +x "$BIN_DIR/agent-studio"
}

uninstall() {
  echo "Removing $INSTALL_ROOT"
  rm -rf "$INSTALL_ROOT"
  rm -f "$BIN_DIR/agent-studio"
  echo "Agent Studio removed."
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    --install-dir)
      INSTALL_ROOT="$2"
      shift 2
      ;;
    --bin-dir)
      BIN_DIR="$2"
      shift 2
      ;;
    --uninstall)
      uninstall
      exit 0
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_cmd curl
require_cmd tar
require_cmd node
if ! command -v shasum >/dev/null 2>&1 && ! command -v sha256sum >/dev/null 2>&1; then
  echo "Missing checksum tool: need shasum or sha256sum" >&2
  exit 1
fi

TARGET_OS="$(detect_os)"
TARGET_ARCH="$(detect_arch)"

if [ "$VERSION" = "latest" ]; then
  VERSION="$(resolve_latest_version)"
fi

if [ -z "$VERSION" ]; then
  echo "Unable to resolve a release version from GitHub." >&2
  exit 1
fi

VERSION_NO_V="${VERSION#v}"
ASSET_NAME="agent-studio-${VERSION_NO_V}-${TARGET_OS}-${TARGET_ARCH}.tar.gz"
CHECKSUM_NAME="${ASSET_NAME}.sha256"
RELEASE_BASE="https://github.com/$REPO/releases/download/$VERSION"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ARCHIVE_PATH="$TMP_DIR/$ASSET_NAME"
CHECKSUM_PATH="$TMP_DIR/$CHECKSUM_NAME"

download "$RELEASE_BASE/$ASSET_NAME" "$ARCHIVE_PATH"
download "$RELEASE_BASE/$CHECKSUM_NAME" "$CHECKSUM_PATH"

EXPECTED_SUM="$(tr -d '[:space:]' < "$CHECKSUM_PATH")"
ACTUAL_SUM="$(checksum_file "$ARCHIVE_PATH")"
if [ "$EXPECTED_SUM" != "$ACTUAL_SUM" ]; then
  echo "Checksum verification failed for $ASSET_NAME" >&2
  exit 1
fi

RELEASE_DIR="$INSTALL_ROOT/releases/$VERSION-$TARGET_OS-$TARGET_ARCH"
mkdir -p "$(dirname "$RELEASE_DIR")"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf "$ARCHIVE_PATH" -C "$RELEASE_DIR" --strip-components=1

mkdir -p "$INSTALL_ROOT"
ln -sfn "$RELEASE_DIR" "$INSTALL_ROOT/current"

install_launcher

echo "Installed Agent Studio $VERSION to $RELEASE_DIR"
echo "Launcher created at $BIN_DIR/agent-studio"
echo "Run 'agent-studio start' to launch the app in the foreground."
echo "Run 'agent-studio background' to launch it in the background."
