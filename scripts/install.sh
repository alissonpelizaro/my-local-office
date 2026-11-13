#!/usr/bin/env bash
# Installs or updates My Local Office from a GitHub release (macOS and Linux).
#
#   curl -fsSL https://github.com/alissonpelizaro/my-local-office/releases/latest/download/install.sh | bash
#
# By default it installs the desktop app: "/Applications/My Local Office.app" on macOS (~/Applications when
# /Applications is not writable); on Linux an AppImage in ~/.local/bin/my-local-office plus a menu entry.
# --server installs the headless background service instead (LaunchAgent / systemd --user unit), for machines
# without a desktop. It is the default on Linux without a display (SSH, servers).
#
# Options:  --version vX.Y.Z   install that release instead of the latest
#           --file PATH        install from a downloaded package (.app.tar.gz, .AppImage, or the server .tar.gz)
#           --server           headless background service instead of the app
#           --no-start         do not open the app / start the service
# Environment: MLO_HOME (default ~/.my-local-office: data, and the server install), MLO_APP_PATH (where the app
#              goes), OFFICE_PORT, OFFICE_HOST, OFFICE_TOKEN, MLO_LABEL (service name), GITHUB_TOKEN (private
#              forks, needs the gh CLI)
#
# The one-click update in the app runs this same script: it closes the app, replaces it and opens it again
# (data stays in $MLO_HOME/data). On the server install it swaps the app folder and restarts the service.
set -euo pipefail

REPO="${MLO_REPO:-alissonpelizaro/my-local-office}"
MLO_HOME="${MLO_HOME:-$HOME/.my-local-office}"
LABEL="${MLO_LABEL:-local.my-local-office}"
PORT="${OFFICE_PORT:-4410}"
HOST="${OFFICE_HOST:-127.0.0.1}"
MODE="${MLO_MODE:-}"
VERSION=latest
FILE=
START=1

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --file) FILE="$2"; shift 2 ;;
    --server) MODE=server; shift ;;
    --no-start | --no-service) START=0; shift ;;
    -h | --help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *) die "unsupported system $(uname -s): macOS and Linux only" ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) ARCH=arm64 ;;
  x86_64 | amd64) ARCH=x64 ;;
  *) die "unsupported architecture $(uname -m)" ;;
esac
if [ -z "$MODE" ]; then
  if [ "$OS" = linux ] && [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then MODE=server; else MODE=app; fi
fi
case "$MODE-$OS" in
  server-*) ASSET="my-local-office-$OS-$ARCH.tar.gz" ;;
  app-darwin) ASSET="my-local-office-darwin-$ARCH.app.tar.gz" ;;
  app-linux) ASSET="my-local-office-linux-$ARCH.AppImage" ;;
  *) die "unknown MLO_MODE=$MODE (app or server)" ;;
esac
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------- download ----------
fetch() { # <asset>: saves $TMP/<asset>
  if [ -n "${GITHUB_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
    say "Downloading $1 ($VERSION) with gh"
    if [ "$VERSION" = latest ]; then
      GH_TOKEN="$GITHUB_TOKEN" gh release download -R "$REPO" -p "$1" -D "$TMP"
    else
      GH_TOKEN="$GITHUB_TOKEN" gh release download "$VERSION" -R "$REPO" -p "$1" -D "$TMP"
    fi
  else
    if [ "$VERSION" = latest ]; then URL="https://github.com/$REPO/releases/latest/download/$1"; else URL="https://github.com/$REPO/releases/download/$VERSION/$1"; fi
    say "Downloading $URL"
    curl -fL --progress-bar "$URL" -o "$TMP/$1" || die "download failed"
  fi
}
if [ -n "$FILE" ]; then cp "$FILE" "$TMP/$ASSET"; else fetch "$ASSET"; fi
mkdir -p "$MLO_HOME/data"
chmod 700 "$MLO_HOME/data"

command -v claude >/dev/null 2>&1 || printf '\nwarning: Claude Code (claude) is not in your PATH. Install it and log in: https://docs.claude.com/claude-code\n\n' >&2

# ---------- desktop app ----------
if [ "$MODE" = app ]; then
  # A running app is closed first; its server leaves with it (it watches the app's pipe).
  stop_app() {
    local pid
    pid="$(cat "$MLO_HOME/data/app.pid" 2>/dev/null || true)"
    [ -n "$pid" ] && ps -p "$pid" -o comm= 2>/dev/null | grep -q my-local-office || return 0
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    for _ in $(seq 40); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" || break; sleep 0.25; done
  }

  if [ "$OS" = darwin ]; then
    DEST="${MLO_APP_PATH:-}"
    if [ -z "$DEST" ]; then
      if [ -w /Applications ]; then DEST="/Applications/My Local Office.app"; else DEST="$HOME/Applications/My Local Office.app"; fi
    fi
    mkdir -p "$TMP/app"
    tar -xzf "$TMP/$ASSET" -C "$TMP/app"
    # Files downloaded through a browser carry the quarantine flag and Gatekeeper would block the app.
    xattr -dr com.apple.quarantine "$TMP/app" 2>/dev/null || true
    "$TMP/app/My Local Office.app/Contents/Resources/app/node/bin/node" -e '' || die "the bundled Node does not run on this machine"
    stop_app
    mkdir -p "$(dirname "$DEST")"
    rm -rf "$DEST"
    mv "$TMP/app/My Local Office.app" "$DEST"
  else
    DEST="${MLO_APP_PATH:-$HOME/.local/bin/my-local-office}"
    chmod +x "$TMP/$ASSET"
    stop_app
    mkdir -p "$(dirname "$DEST")"
    mv -f "$TMP/$ASSET" "$DEST"
    ICONS="$HOME/.local/share/icons/hicolor/256x256/apps"
    APPS="$HOME/.local/share/applications"
    mkdir -p "$ICONS" "$APPS"
    if [ -z "$FILE" ]; then (fetch my-local-office.png) && mv -f "$TMP/my-local-office.png" "$ICONS/" || true; fi
    cat >"$APPS/my-local-office.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=My Local Office
Comment=Claude Code agents working together in a local virtual office
Exec="$DEST"
Icon=my-local-office
Categories=Development;
Terminal=false
DESKTOP
    update-desktop-database "$APPS" >/dev/null 2>&1 || true
  fi
  say "My Local Office installed in $DEST"

  # The background service of the versions before the app (1.1 and older) ran $MLO_HOME/app: the app replaces it.
  # A service that runs something else (a source checkout) is left alone.
  if [ "$OS" = darwin ]; then
    PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
    if grep -qF "$MLO_HOME/app/" "$PLIST" 2>/dev/null; then
      launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
      rm -f "$PLIST"
      say "Removed the old background service (the app runs the office now)"
    fi
  else
    UNIT="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/$LABEL.service"
    if grep -qF "$MLO_HOME/app/" "$UNIT" 2>/dev/null; then
      systemctl --user disable --now "$LABEL.service" 2>/dev/null || true
      rm -f "$UNIT"
      systemctl --user daemon-reload 2>/dev/null || true
      say "Removed the old background service (the app runs the office now)"
    fi
  fi
  rm -rf "$MLO_HOME/app" "$MLO_HOME/app.old" "$MLO_HOME/app.new"

  [ "$START" = 1 ] || exit 0
  if [ "$OS" = darwin ]; then open "$DEST"; else (setsid "$DEST" >/dev/null 2>&1 &); fi
  say "Opening My Local Office (data in $MLO_HOME/data)"
  exit 0
fi

# ---------- server: unpack and swap ----------
rm -rf "$MLO_HOME/app.new"
mkdir -p "$MLO_HOME/app.new"
tar -xzf "$TMP/$ASSET" -C "$MLO_HOME/app.new" --strip-components=1
if [ "$OS" = darwin ]; then xattr -dr com.apple.quarantine "$MLO_HOME/app.new" 2>/dev/null || true; fi
"$MLO_HOME/app.new/node/bin/node" -e '' || die "the bundled Node does not run on this machine"
rm -rf "$MLO_HOME/app.old"
if [ -d "$MLO_HOME/app" ]; then mv "$MLO_HOME/app" "$MLO_HOME/app.old"; fi
mv "$MLO_HOME/app.new" "$MLO_HOME/app"
INSTALLED="$(cat "$MLO_HOME/app/VERSION")"
say "My Local Office $INSTALLED installed in $MLO_HOME/app"

NODE="$MLO_HOME/app/node/bin/node"
MAIN="$MLO_HOME/app/apps/server/src/main.ts"
LOG="$MLO_HOME/data/office.log"

if [ "$START" = 0 ]; then
  say "Start it with: MLO_HOME=$MLO_HOME $MLO_HOME/app/scripts/start.sh"
  exit 0
fi

# ---------- background service (starts on login, restarts if it crashes) ----------
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

if [ "$OS" = darwin ]; then
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  mkdir -p "$(dirname "$PLIST")"
  cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml "$NODE")</string>
    <string>--disable-warning=ExperimentalWarning</string>
    <string>$(xml "$MAIN")</string>
  </array>
  <key>WorkingDirectory</key><string>$(xml "$MLO_HOME/app")</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(xml "$PATH")</string>
    <key>HOME</key><string>$(xml "$HOME")</string>
    <key>MLO_HOME</key><string>$(xml "$MLO_HOME")</string>
    <key>MLO_LABEL</key><string>$(xml "$LABEL")</string>
    <key>MLO_MODE</key><string>server</string>
    <key>OFFICE_PORT</key><string>$PORT</string>
    <key>OFFICE_HOST</key><string>$(xml "$HOST")</string>
    <key>OFFICE_TOKEN</key><string>$(xml "${OFFICE_TOKEN:-}")</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$(xml "$LOG")</string>
  <key>StandardErrorPath</key><string>$(xml "$LOG")</string>
</dict>
</plist>
PLIST
  chmod 600 "$PLIST"
  DOMAIN="gui/$(id -u)"
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  # bootout returns before launchd finishes tearing the job down; bootstrapping too early fails with
  # "Input/output error". Wait for the old job to go away, then retry a few times.
  for _ in $(seq 40); do launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || break; sleep 0.25; done
  for attempt in 1 2 3 4 5; do
    launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null && break
    [ "$attempt" = 5 ] && launchctl bootstrap "$DOMAIN" "$PLIST"
    sleep 1
  done
else
  if ! systemctl --user show-environment >/dev/null 2>&1; then
    say "systemd --user is not available here. Start it with: MLO_HOME=$MLO_HOME $MLO_HOME/app/scripts/start.sh"
    exit 0
  fi
  UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  mkdir -p "$UNIT_DIR"
  cat >"$UNIT_DIR/$LABEL.service" <<UNIT
[Unit]
Description=My Local Office
After=network-online.target

[Service]
ExecStart="$NODE" --disable-warning=ExperimentalWarning "$MAIN"
WorkingDirectory=$MLO_HOME/app
Environment="PATH=$PATH" "HOME=$HOME" "MLO_HOME=$MLO_HOME" "MLO_LABEL=$LABEL" "MLO_MODE=server" "OFFICE_PORT=$PORT" "OFFICE_HOST=$HOST" "OFFICE_TOKEN=${OFFICE_TOKEN:-}"
Restart=always
RestartSec=3
StandardOutput=append:$LOG
StandardError=append:$LOG

[Install]
WantedBy=default.target
UNIT
  chmod 600 "$UNIT_DIR/$LABEL.service"
  systemctl --user daemon-reload
  systemctl --user enable "$LABEL.service" >/dev/null 2>&1
  say "Running in the background. To keep it up without a login session: loginctl enable-linger $USER"
  # Last step: when called by the in-app update, restarting the unit ends this script too.
  systemctl --user restart "$LABEL.service"
fi

say "My Local Office $INSTALLED on http://$HOST:$PORT (logs: $LOG)"
