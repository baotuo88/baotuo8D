#!/usr/bin/env bash
set -euo pipefail

DUMP_FILE="${1:-}"
if [[ -z "$DUMP_FILE" ]]; then
  echo "Usage: $0 <dump-file>"
  exit 1
fi

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "Dump file not found: $DUMP_FILE"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$DUMP_FILE"

echo "restore completed from: $DUMP_FILE"
