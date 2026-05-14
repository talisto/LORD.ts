#!/usr/bin/env bash
# play-door.sh - Run LORD as a BBS door game
#
# Usage:
#   ./play-door.sh                           # Auto-detect drop file in cwd
#   ./play-door.sh -d /path/to/door32.sys    # Explicit drop file
#   ./play-door.sh --env-file .env.game2 --local [username]
#   ./play-door.sh --local [username]         # Local mode (no BBS)
#   ./play-door.sh --node 2                   # Override node number
#
# See door.ts for full option list and environment variables.
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
    echo "SKIP_EXEC=1: would exec: npx tsx \"$SCRIPT_DIR/door.ts\" $*"
    exit 0
fi

exec npx tsx "$SCRIPT_DIR/door.ts" "$@"
