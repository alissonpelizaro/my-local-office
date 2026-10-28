#!/bin/bash
# Remove o LaunchAgent. Dados (data/) e worktrees continuam onde estão.
set -euo pipefail
LABEL=local.my-local-office
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "LaunchAgent removido."
