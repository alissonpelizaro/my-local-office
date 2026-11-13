#!/usr/bin/env bash
# Assembles the app folder for one platform: server, built web UI, scripts and the Node runtime from .tool-versions.
# It is the content of the headless package and the resources/app of the desktop app. Run `pnpm build` first.
#
#   scripts/stage-app.sh <dir> <version> [target]     targets: darwin-arm64 darwin-x64 linux-x64 linux-arm64 (default: this machine)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${1:?usage: stage-app.sh <dir> <version> [target]}"
VERSION="${2:?usage: stage-app.sh <dir> <version> [target]}"
VERSION="${VERSION#v}"
TARGET="${3:-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m | sed -e 's/x86_64/x64/' -e 's/aarch64/arm64/')}"
NODE_VERSION="$(awk '$1 == "nodejs" { print $2 }' "$ROOT/.tool-versions")"
[ -f "$ROOT/apps/web/dist/index.html" ] || { echo "apps/web/dist is missing: run pnpm build first" >&2; exit 1; }

# Everything but node/ is copied again; Node is kept when it is already the right version and platform.
mkdir -p "$DIR"
find "$DIR" -mindepth 1 -maxdepth 1 ! -name node -exec rm -rf {} +
mkdir -p "$DIR/apps/server" "$DIR/apps/web" "$DIR/scripts"
cp "$ROOT/package.json" "$ROOT/README.md" "$DIR/"
if [ -f "$ROOT/LICENSE" ]; then cp "$ROOT/LICENSE" "$DIR/"; fi
cp "$ROOT/apps/server/package.json" "$DIR/apps/server/"
cp -R "$ROOT/apps/server/src" "$DIR/apps/server/src"
find "$DIR/apps/server/src" -name '*.test.*' -delete
cp -R "$ROOT/apps/web/dist" "$DIR/apps/web/dist"
cp "$ROOT/scripts/install.sh" "$ROOT/scripts/uninstall.sh" "$ROOT/scripts/start.sh" "$DIR/scripts/"
chmod +x "$DIR/scripts/"*.sh
echo "$VERSION" >"$DIR/VERSION"

if [ "$(cat "$DIR/node/TARGET" 2>/dev/null)" = "$NODE_VERSION-$TARGET" ]; then exit 0; fi
# Official Node, checked against the SHASUMS256 published by nodejs.org.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tarball="node-v$NODE_VERSION-$TARGET.tar.gz"
echo "==> Node $NODE_VERSION for $TARGET"
curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$WORK/SHASUMS256.txt"
curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$tarball" -o "$WORK/$tarball"
(cd "$WORK" && grep " $tarball\$" SHASUMS256.txt | shasum -a 256 -c - >/dev/null) || { echo "checksum mismatch for $tarball" >&2; exit 1; }
tar -xzf "$WORK/$tarball" -C "$WORK" "node-v$NODE_VERSION-$TARGET/bin/node" "node-v$NODE_VERSION-$TARGET/LICENSE"
rm -rf "$DIR/node"
mkdir -p "$DIR/node/bin"
mv "$WORK/node-v$NODE_VERSION-$TARGET/bin/node" "$DIR/node/bin/node"
mv "$WORK/node-v$NODE_VERSION-$TARGET/LICENSE" "$DIR/node/LICENSE"
echo "$NODE_VERSION-$TARGET" >"$DIR/node/TARGET"
