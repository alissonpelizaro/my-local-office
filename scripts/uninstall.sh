#!/usr/bin/env bash
# Removes what install.sh installed: the desktop app or the background service. Your data ($MLO_HOME/data:
# office database, worktrees, intern folders) is kept unless you pass --purge.
#
#   curl -fsSL https://github.com/alissonpelizaro/my-local-office/releases/latest/download/uninstall.sh | bash
set -euo pipefail
MLO_HOME="${MLO_HOME:-$HOME/.my-local-office}"
LABEL="${MLO_LABEL:-local.my-local-office}"
case "$MLO_HOME" in "" | / | "$HOME" | "$HOME/") echo "refusing to remove MLO_HOME=$MLO_HOME" >&2; exit 1 ;; esac

pid="$(cat "$MLO_HOME/data/app.pid" 2>/dev/null || true)"
if [ -n "$pid" ] && ps -p "$pid" -o comm= 2>/dev/null | grep -q my-local-office; then kill "$pid" 2>/dev/null || true; fi

# Only the service that runs the installed package ($MLO_HOME/app); one that runs a source checkout stays.
if [ "$(uname -s)" = Darwin ]; then
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  if grep -qF "$MLO_HOME/app/" "$PLIST" 2>/dev/null; then
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
  fi
  rm -rf "${MLO_APP_PATH:-/Applications/My Local Office.app}" "$HOME/Applications/My Local Office.app"
else
  UNIT="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/$LABEL.service"
  if grep -qF "$MLO_HOME/app/" "$UNIT" 2>/dev/null; then
    systemctl --user disable --now "$LABEL.service" 2>/dev/null || true
    rm -f "$UNIT"
    systemctl --user daemon-reload 2>/dev/null || true
  fi
  rm -f "${MLO_APP_PATH:-$HOME/.local/bin/my-local-office}" "$HOME/.local/share/applications/my-local-office.desktop" "$HOME/.local/share/icons/hicolor/256x256/apps/my-local-office.png"
fi

rm -rf "$MLO_HOME/app" "$MLO_HOME/app.old" "$MLO_HOME/app.new"
if [ "${1:-}" = --purge ]; then
  rm -rf "$MLO_HOME"
  echo "My Local Office removed, data included."
else
  echo "My Local Office removed. Your data is still in $MLO_HOME/data (run with --purge to delete it)."
fi
