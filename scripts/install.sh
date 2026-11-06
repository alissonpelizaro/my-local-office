#!/usr/bin/env bash
# Installs or updates My Local Office from a GitHub release (macOS and Linux).
#
#   curl -fsSL https://github.com/alissonpelizaro/my-local-office/releases/latest/download/install.sh | bash
#
# Options:  --version vX.Y.Z   install that release instead of the latest
#           --file PATH        install from a downloaded my-local-office-<os>-<arch>.tar.gz
#           --no-service       do not install/restart the background service
# Environment: MLO_HOME (default ~/.my-local-office), OFFICE_PORT, OFFICE_HOST, OFFICE_TOKEN,
#              MLO_LABEL (service name), GITHUB_TOKEN (private forks, needs the gh CLI)
#
# The same script runs the one-click update from the app: it downloads the package, swaps the app folder
# (data stays in $MLO_HOME/data), removes the macOS quarantine flag and restarts the service.
set -euo pipefail

REPO="${MLO_REPO:-alissonpelizaro/my-local-office}"
MLO_HOME="${MLO_HOME:-$HOME/.my-local-office}"
LABEL="${MLO_LABEL:-local.my-local-office}"
PORT="${OFFICE_PORT:-4410}"
HOST="${OFFICE_HOST:-127.0.0.1}"
VERSION=latest
FILE=
SERVICE=1

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --file) FILE="$2"; shift 2 ;;
    --no-service) SERVICE=0; shift ;;
    -h | --help) sed -n '2,15p' "$0"; exit 0 ;;
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
ASSET="my-local-office-$OS-$ARCH.tar.gz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------- download ----------
if [ -n "$FILE" ]; then
  cp "$FILE" "$TMP/$ASSET"
elif [ -n "${GITHUB_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
  say "Downloading $ASSET ($VERSION) with gh"
  if [ "$VERSION" = latest ]; then
    GH_TOKEN="$GITHUB_TOKEN" gh release download -R "$REPO" -p "$ASSET" -D "$TMP"
  else
    GH_TOKEN="$GITHUB_TOKEN" gh release download "$VERSION" -R "$REPO" -p "$ASSET" -D "$TMP"
  fi
else
  if [ "$VERSION" = latest ]; then URL="https://github.com/$REPO/releases/latest/download/$ASSET"; else URL="https://github.com/$REPO/releases/download/$VERSION/$ASSET"; fi
  say "Downloading $URL"
  curl -fL --progress-bar "$URL" -o "$TMP/$ASSET" || die "download failed"
fi

# ---------- unpack and swap ----------
mkdir -p "$MLO_HOME/data"
chmod 700 "$MLO_HOME/data"
rm -rf "$MLO_HOME/app.new"
mkdir -p "$MLO_HOME/app.new"
tar -xzf "$TMP/$ASSET" -C "$MLO_HOME/app.new" --strip-components=1
# Files downloaded through a browser carry the quarantine flag and Gatekeeper would block the bundled Node.
if [ "$OS" = darwin ]; then xattr -dr com.apple.quarantine "$MLO_HOME/app.new" 2>/dev/null || true; fi
"$MLO_HOME/app.new/node/bin/node" -e '' || die "the bundled Node does not run on this machine"
rm -rf "$MLO_HOME/app.old"
if [ -d "$MLO_HOME/app" ]; then mv "$MLO_HOME/app" "$MLO_HOME/app.old"; fi
mv "$MLO_HOME/app.new" "$MLO_HOME/app"
INSTALLED="$(cat "$MLO_HOME/app/VERSION")"
say "My Local Office $INSTALLED installed in $MLO_HOME/app"

command -v claude >/dev/null 2>&1 || printf '\nwarning: Claude Code (claude) is not in your PATH. Install it and log in: https://docs.claude.com/claude-code\n\n' >&2

NODE="$MLO_HOME/app/node/bin/node"
MAIN="$MLO_HOME/app/apps/server/src/main.ts"
LOG="$MLO_HOME/data/office.log"

if [ "$SERVICE" = 0 ]; then
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
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
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
Environment="PATH=$PATH" "HOME=$HOME" "MLO_HOME=$MLO_HOME" "MLO_LABEL=$LABEL" "OFFICE_PORT=$PORT" "OFFICE_HOST=$HOST" "OFFICE_TOKEN=${OFFICE_TOKEN:-}"
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
