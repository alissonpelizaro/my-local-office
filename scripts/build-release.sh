#!/usr/bin/env bash
# Builds the headless release packages in dist/ (install.sh --server): one .tar.gz per platform with the app
# (server + built web UI) and Node bundled. The desktop app is built per platform by the release workflow.
#
#   scripts/build-release.sh <version> [target...]      targets: darwin-arm64 darwin-x64 linux-x64 linux-arm64
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:?usage: build-release.sh <version> [target...]}"
shift
TARGETS=("$@")
[ ${#TARGETS[@]} -gt 0 ] || TARGETS=(darwin-arm64 darwin-x64 linux-x64 linux-arm64)
OUT="$ROOT/dist"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

(cd "$ROOT" && pnpm build)
mkdir -p "$OUT"
for t in "${TARGETS[@]}"; do
  bash "$ROOT/scripts/stage-app.sh" "$WORK/my-local-office" "$VERSION" "$t"
  tar -czf "$OUT/my-local-office-$t.tar.gz" -C "$WORK" my-local-office
done

cp "$ROOT/scripts/install.sh" "$ROOT/scripts/uninstall.sh" "$OUT/"
cp "$ROOT/apps/desktop/src-tauri/icons/128x128@2x.png" "$OUT/my-local-office.png" # menu entry of the Linux app
(cd "$OUT" && shasum -a 256 ./*.tar.gz install.sh uninstall.sh >SHA256SUMS)
ls -lh "$OUT"
