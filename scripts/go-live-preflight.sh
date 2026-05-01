#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1"; exit 1; }
}

require_cmd docker
require_cmd curl

echo "[1/7] checking required env vars..."
: "${JWT_SECRET:?JWT_SECRET is required}"
: "${CORS_ORIGIN:?CORS_ORIGIN is required}"
: "${METRICS_TOKEN:?METRICS_TOKEN is required}"
: "${SECRET_CRYPTO_KEY:?SECRET_CRYPTO_KEY is required}"

if [[ ${#JWT_SECRET} -lt 32 ]]; then
  echo "JWT_SECRET length must be >= 32"
  exit 1
fi

if [[ "$CORS_ORIGIN" == "*" ]]; then
  echo "CORS_ORIGIN must not be '*'"
  exit 1
fi

echo "[2/7] checking metrics token secret file..."
if [[ ! -f deploy/monitoring/secrets/metrics_token ]]; then
  echo "missing deploy/monitoring/secrets/metrics_token"
  echo "run: METRICS_TOKEN=... ./deploy/monitoring/generate-secrets.sh"
  exit 1
fi

echo "[3/7] rendering compose config..."
docker compose --profile prod --profile monitoring config >/tmp/eightd.compose.rendered.yml

echo "[4/7] checking service health..."
docker compose ps

if docker compose ps --format json >/tmp/eightd.compose.ps.json 2>/dev/null; then
  if grep -Eq '"State":"(exited|dead)"' /tmp/eightd.compose.ps.json; then
    echo "found exited/dead container"
    cat /tmp/eightd.compose.ps.json
    exit 1
  fi
fi

echo "[5/7] checking api health..."
HEALTH_JSON="$(curl -fsS http://127.0.0.1:8080/api/health)"
echo "$HEALTH_JSON"

echo "[6/7] checking metrics auth..."
curl -fsS -H "Authorization: Bearer ${METRICS_TOKEN}" http://127.0.0.1:8080/metrics | head -n 5

echo "[7/7] running backend smoke + integration tests..."
(
  cd backend
  SMOKE_BASE_URL=http://127.0.0.1:8080/api npm run smoke
  TEST_BASE_URL=http://127.0.0.1:8080/api TEST_METRICS_URL=http://127.0.0.1:8080/metrics TEST_METRICS_TOKEN="${METRICS_TOKEN}" npm run test:integration
)

echo "preflight passed"
