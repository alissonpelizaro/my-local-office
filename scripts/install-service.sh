#!/bin/bash
# Instala o My Local Office como LaunchAgent: sobe no login e reinicia se cair (http://127.0.0.1:4410).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL=local.my-local-office
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

# launchd não carrega o shell: node e PATH (claude, git, gh) são resolvidos agora e gravados no plist.
NODE="$(cd "$ROOT" && { asdf which node 2>/dev/null || command -v node; })"
command -v claude >/dev/null || { echo "claude não encontrado no PATH" >&2; exit 1; }

(cd "$ROOT" && pnpm install --frozen-lockfile && pnpm build)
mkdir -p "$ROOT/data" && chmod 700 "$ROOT/data"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--disable-warning=ExperimentalWarning</string>
    <string>apps/server/src/main.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$PATH</string>
    <key>HOME</key><string>$HOME</string>
    <key>OFFICE_HOST</key><string>${OFFICE_HOST:-127.0.0.1}</string>
    <key>OFFICE_TOKEN</key><string>${OFFICE_TOKEN:-}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ROOT/data/office.log</string>
  <key>StandardErrorPath</key><string>$ROOT/data/office.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "My Local Office em http://${OFFICE_HOST:-127.0.0.1}:4410 (logs: data/office.log)"
