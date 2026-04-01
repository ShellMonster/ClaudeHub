#!/bin/bash
# 构建文档站 — 复制最新数据到 docs/
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Copying data to docs/..."
mkdir -p "$PROJECT_DIR/docs/data"
cp "$PROJECT_DIR/data/claude-code-nav.json" "$PROJECT_DIR/docs/data/claude-code-nav.json"

echo "Docs build complete!"
ls -lh "$PROJECT_DIR/docs/data/claude-code-nav.json"
