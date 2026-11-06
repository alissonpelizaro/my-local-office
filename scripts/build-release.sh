#!/usr/bin/env bash
# Builds the release packages in dist/: one .tar.gz per platform with the app (server + built web UI) and
# the Node runtime from .tool-versions, so the install needs nothing but Claude Code.
#
#   scripts/build-release.sh <version> [target...]      targets: darwin-arm64 darwin-x64 linux-x64 linux-arm64
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:?usage: build-release.sh <version> [target...]}"
VERSION="${VERSION#v}"
shift
TARGETS=("$@")
[ ${#TARGETS[@]} -gt 0 ] || TARGETS=(darwin-arm64 darwin-x64 linux-x64 linux-arm64)
NODE_VERSION="$(awk '$1 == "nodejs" { print $2 }' "$ROOT/.tool-versions")"
OUT="$ROOT/dist"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
STAGE="$WORK/my-local-office"

(cd "$ROOT" && pnpm build)

mkdir -p "$OUT" "$STAGE/apps/server" "$STAGE/apps/web" "$STAGE/scripts"
cp "$ROOT/package.json" "$ROOT/README.md" "$STAGE/"
if [ -f "$ROOT/LICENSE" ]; then cp "$ROOT/LICENSE" "$STAGE/"; fi
cp "$ROOT/apps/server/package.json" "$STAGE/apps/server/"
cp -R "$ROOT/apps/server/src" "$STAGE/apps/server/src"
find "$STAGE/apps/server/src" -name '*.test.*' -delete
cp -R "$ROOT/apps/web/dist" "$STAGE/apps/web/dist"
cp "$ROOT/scripts/install.sh" "$ROOT/scripts/uninstall.sh" "$ROOT/scripts/start.sh" "$STAGE/scripts/"
chmod +x "$STAGE/scripts/"*.sh
echo "$VERSION" >"$STAGE/VERSION"

# Node oficial, conferido contra o SHASUMS256 publicado pelo nodejs.org.
curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$WORK/SHASUMS256.txt"
for t in "${TARGETS[@]}"; do
  tarball="node-v$NODE_VERSION-$t.tar.gz"
  echo "==> $t (Node $NODE_VERSION)"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$tarball" -o "$WORK/$tarball"
  (cd "$WORK" && grep " $tarball\$" SHASUMS256.txt | shasum -a 256 -c - >/dev/null) || { echo "checksum mismatch for $tarball" >&2; exit 1; }
  rm -rf "$STAGE/node" "$WORK/node-v$NODE_VERSION-$t"
  tar -xzf "$WORK/$tarball" -C "$WORK" "node-v$NODE_VERSION-$t/bin/node" "node-v$NODE_VERSION-$t/LICENSE"
  mkdir -p "$STAGE/node/bin"
  mv "$WORK/node-v$NODE_VERSION-$t/bin/node" "$STAGE/node/bin/node"
  mv "$WORK/node-v$NODE_VERSION-$t/LICENSE" "$STAGE/node/LICENSE"
  tar -czf "$OUT/my-local-office-$t.tar.gz" -C "$WORK" my-local-office
done

cp "$ROOT/scripts/install.sh" "$OUT/install.sh"
(cd "$OUT" && shasum -a 256 ./*.tar.gz install.sh >SHA256SUMS)
ls -lh "$OUT"
