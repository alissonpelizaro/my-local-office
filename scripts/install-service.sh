#!/bin/bash
# A partir do código-fonte (macOS): instala o LaunchAgent que sobe no login e reinicia se cair (http://127.0.0.1:4410).
# Para instalar o pacote pronto (macOS e Linux), use scripts/install.sh.
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

chmod 600 "$PLIST" # pode conter o OFFICE_TOKEN
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
# bootout volta antes de o launchd desmontar o job; bootstrap cedo demais falha com "Input/output error".
for _ in $(seq 40); do launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || break; sleep 0.25; done
for attempt in 1 2 3 4 5; do
  launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null && break
  [ "$attempt" = 5 ] && launchctl bootstrap "gui/$(id -u)" "$PLIST"
  sleep 1
done
echo "My Local Office em http://${OFFICE_HOST:-127.0.0.1}:4410 (logs: data/office.log)"
