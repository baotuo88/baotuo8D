#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SECRET_DIR="$ROOT_DIR/secrets"
mkdir -p "$SECRET_DIR"

if [[ -z "${METRICS_TOKEN:-}" ]]; then
  echo "METRICS_TOKEN is required"
  exit 1
fi

echo -n "$METRICS_TOKEN" > "$SECRET_DIR/metrics_token"
chmod 600 "$SECRET_DIR/metrics_token"

echo "generated: $SECRET_DIR/metrics_token"
