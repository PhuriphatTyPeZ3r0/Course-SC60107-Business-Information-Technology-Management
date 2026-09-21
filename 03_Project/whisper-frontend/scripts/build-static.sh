#!/usr/bin/env bash
# Builds the static export for Cloudflare Pages (see next.config.ts).
# Temporarily moves app/api/** (the mock backend, server-only route
# handlers) out of the tree, since `output: "export"` cannot build a
# project containing them - restores it afterward regardless of outcome.
set -euo pipefail
cd "$(dirname "$0")/.."

API_DIR="src/app/api"
BACKUP_DIR=".api-backup-tmp"

cleanup() {
  if [ -d "$BACKUP_DIR" ]; then
    rm -rf "$API_DIR"
    mv "$BACKUP_DIR" "$API_DIR"
  fi
}
trap cleanup EXIT

if [ -d "$API_DIR" ]; then
  mv "$API_DIR" "$BACKUP_DIR"
fi

STATIC_EXPORT=1 npx next build
