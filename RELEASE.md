# Release Runbook

## 1. Prerequisites

- Set production env vars (especially `JWT_SECRET`, `CORS_ORIGIN`, DB credentials, OpenAI keys).
- Ensure `CORS_ORIGIN` is not `*` in production.
- Review go-live checklist: `GO_LIVE_CHECKLIST.md`

## 2. Deploy

```bash
docker compose pull
docker compose --profile prod up -d --build
```

Deployment sequence:

1. `postgres` ready
2. `migrator` runs `npm run migrate`
3. `backend` and `worker` start only after migration succeeds
4. `frontend` starts after backend healthcheck passes

## 3. Verify

```bash
curl -s http://127.0.0.1:8080/api/health
cd backend && SMOKE_BASE_URL=http://127.0.0.1:8080/api npm run smoke
curl -H "Authorization: Bearer ${METRICS_TOKEN}" -s http://127.0.0.1:8080/metrics | head
```

One-command preflight:

```bash
JWT_SECRET=... CORS_ORIGIN=... METRICS_TOKEN=... ./scripts/go-live-preflight.sh
```

Expected:

- health status `ok`
- checks include `database/redis/chroma = ok`
- smoke status `ok`

## 4. Rollback

- Rollback image tag and redeploy:

```bash
docker compose up -d --build
```

- If a migration introduced incompatible changes, restore DB from backup first, then redeploy previous version.

## 5. Operational Baseline

- Monitor container health and restart count.
- Alert on API 5xx rate and `/api/health` failure.
- Scrape backend `/metrics` from Prometheus.
- Keep daily DB backups and verify restore weekly.

Monitoring stack (optional):

```bash
export METRICS_TOKEN=your_metrics_token
./deploy/monitoring/generate-secrets.sh
docker compose --profile prod --profile monitoring up -d
```

Public exposure policy:

- Do not expose backend `/metrics` on public edge.
- Use edge ACL / private network scraping only.
- Reference templates:
  - `deploy/edge/nginx-public-template.conf`
  - `deploy/edge/ingress-public-template.yaml`

## 6. Backup / Restore

Backup:

```bash
cd backend
DATABASE_URL=postgresql://user:pass@host:5432/db ./scripts/db-backup.sh ./backups
```

Restore:

```bash
cd backend
DATABASE_URL=postgresql://user:pass@host:5432/db ./scripts/db-restore.sh ./backups/xxx.dump
```
