#!/usr/bin/env bash
# Removes the service and the app installed by install.sh. Your data ($MLO_HOME/data: office database,
# worktrees, intern folders) is kept unless you pass --purge.
set -euo pipefail
MLO_HOME="${MLO_HOME:-$HOME/.my-local-office}"
LABEL="${MLO_LABEL:-local.my-local-office}"
case "$MLO_HOME" in "" | / | "$HOME" | "$HOME/") echo "refusing to remove MLO_HOME=$MLO_HOME" >&2; exit 1 ;; esac

if [ "$(uname -s)" = Darwin ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
elif command -v systemctl >/dev/null 2>&1; then
  systemctl --user disable --now "$LABEL.service" 2>/dev/null || true
  rm -f "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/$LABEL.service"
  systemctl --user daemon-reload 2>/dev/null || true
fi

rm -rf "$MLO_HOME/app" "$MLO_HOME/app.old" "$MLO_HOME/app.new"
if [ "${1:-}" = --purge ]; then
  rm -rf "$MLO_HOME"
  echo "My Local Office removed, data included."
else
  echo "My Local Office removed. Your data is still in $MLO_HOME/data (run with --purge to delete it)."
fi
