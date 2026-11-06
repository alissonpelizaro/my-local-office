#!/usr/bin/env bash
# Runs the packaged server in the foreground (the background service runs the same command).
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
export MLO_HOME="${MLO_HOME:-$(dirname "$APP")}"
exec "$APP/node/bin/node" --disable-warning=ExperimentalWarning "$APP/apps/server/src/main.ts"
