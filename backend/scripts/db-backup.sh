#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-./backups}"
TS="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUT_DIR"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

OUT_FILE="$OUT_DIR/eightd_${TS}.dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$OUT_FILE"

echo "backup created: $OUT_FILE"
