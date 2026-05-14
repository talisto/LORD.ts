#!/usr/bin/env bash
# Copy non-TypeScript assets from igm/ into dist/igm/ so that compiled JS
# modules can find their data files (JSON, TXT, ANS, RHP, DAT, etc.) without
# reaching back into the source tree.
#
# Run automatically after `npm run build` via the postbuild hook.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$PROJECT_ROOT/igm"
DEST_DIR="$PROJECT_ROOT/dist/igm"

if [ ! -d "$SRC_DIR" ]; then
    echo "No igm/ directory found - skipping asset copy."
    exit 0
fi

if [ ! -d "$DEST_DIR" ]; then
    echo "No dist/igm/ directory found - run tsc first."
    exit 0
fi

# Copy every non-TS, non-config file, preserving directory structure.
# Excludes: *.ts, package.json, tsconfig.json, node_modules/, .DS_Store
count=0
while IFS= read -r -d '' file; do
    rel="${file#"$SRC_DIR"/}"
    dest="$DEST_DIR/$rel"
    mkdir -p "$(dirname "$dest")"
    cp "$file" "$dest"
    count=$((count + 1))
done < <(find "$SRC_DIR" -type f \
    ! -name '*.ts' \
    ! -name 'package.json' \
    ! -name 'tsconfig.json' \
    ! -name '.DS_Store' \
    ! -path '*/node_modules/*' \
    -print0)

if [ "$count" -gt 0 ]; then
    echo "Copied $count IGM asset(s) to dist/igm/"
fi
