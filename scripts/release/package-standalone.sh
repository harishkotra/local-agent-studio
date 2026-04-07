#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <version> <os> <arch>" >&2
  exit 1
fi

VERSION="$1"
TARGET_OS="$2"
TARGET_ARCH="$3"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$ROOT_DIR/apps/web"
STANDALONE_DIR="$APP_DIR/.next/standalone"
STATIC_DIR="$APP_DIR/.next/static"
PUBLIC_DIR="$APP_DIR/public"
RELEASE_DIR="$ROOT_DIR/.release"
PACKAGE_NAME="agent-studio-${VERSION}-${TARGET_OS}-${TARGET_ARCH}"
STAGING_DIR="$RELEASE_DIR/$PACKAGE_NAME"
ARCHIVE_PATH="$RELEASE_DIR/${PACKAGE_NAME}.tar.gz"
CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"

if [ ! -d "$STANDALONE_DIR" ]; then
  echo "standalone build output not found at $STANDALONE_DIR" >&2
  echo "run 'npm run build' first" >&2
  exit 1
fi

rm -rf "$STAGING_DIR" "$ARCHIVE_PATH" "$CHECKSUM_PATH"
mkdir -p "$STAGING_DIR"

cp -R "$STANDALONE_DIR"/. "$STAGING_DIR"/
rm -rf "$STAGING_DIR/apps/web/data"
find "$STAGING_DIR" \( -name "*.db" -o -name "*.db-wal" -o -name "*.db-shm" \) -delete
mkdir -p "$STAGING_DIR/apps/web/.next"
cp -R "$STATIC_DIR" "$STAGING_DIR/apps/web/.next/static"

if [ -d "$PUBLIC_DIR" ]; then
  mkdir -p "$STAGING_DIR/apps/web"
  cp -R "$PUBLIC_DIR" "$STAGING_DIR/apps/web/public"
fi

cat > "$STAGING_DIR/INSTALL_METADATA" <<EOF
version=$VERSION
os=$TARGET_OS
arch=$TARGET_ARCH
packaged_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

tar -C "$RELEASE_DIR" -czf "$ARCHIVE_PATH" "$PACKAGE_NAME"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}' > "$CHECKSUM_PATH"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$ARCHIVE_PATH" | awk '{print $1}' > "$CHECKSUM_PATH"
else
  echo "Neither shasum nor sha256sum is available" >&2
  exit 1
fi

echo "Created $ARCHIVE_PATH"
echo "Created $CHECKSUM_PATH"
