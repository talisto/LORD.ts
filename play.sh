#!/usr/bin/env bash
# play.sh - Run LORD using tsx (no web server needed)
#
# Usage:
#   ./play.sh              # will prompt for character name
#   ./play.sh "YourName"   # start immediately as the given character
#   ./play.sh --env-file .env.game2 "YourName" # run with a specific env file
#   ./play.sh --god        # enable the local in-game god console
#   ./play.sh --god "Name" # enable god console and start as the given character
#
# Requirements: Node.js >=22 with dependencies installed
#   npm install

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "Installing dependencies..."
    (cd "$SCRIPT_DIR" && npm install)
fi

# Testing hook: if SKIP_EXEC=1 is set, don't exec the node binary (useful for CI/tests)
if [ "${SKIP_EXEC:-0}" = "1" ]; then
    echo "SKIP_EXEC=1: would exec: npx tsx \"$SCRIPT_DIR/door.ts\" --cli $*"
    exit 0
fi

exec npx tsx "$SCRIPT_DIR/door.ts" --cli "$@"
