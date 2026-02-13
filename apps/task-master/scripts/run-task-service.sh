#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/Users/ahmedshabbir/code/clawd/task"
LOG_DIR="$HOME/Library/Logs/task"
mkdir -p "$LOG_DIR"

cd "$APP_DIR"

# Ensure dependencies are installed (idempotent)
if [ ! -d node_modules ]; then
  npm install
fi

# Ensure DB exists + seed baseline auth data
npm --workspace apps/api run db:push >/dev/null
npm --workspace apps/api run db:seed >/dev/null || true

# Ensure web build exists
if [ ! -d apps/web/dist ]; then
  npm --workspace apps/web run build >/dev/null
fi

# Start API (serves web if dist exists)
exec /opt/homebrew/bin/node "$APP_DIR/apps/api/src/index.js"
