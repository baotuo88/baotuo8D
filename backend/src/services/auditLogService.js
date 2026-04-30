import { query } from "../db/pool.js";
import { httpError } from "../utils/httpError.js";

function normalizeText(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

export async function createAuditLog(payload = {}) {
  await query(
    `
    INSERT INTO audit_logs (
      actor_id,
      actor_role,
      action,
      resource_type,
      resource_id,
      status,
      detail,
      ip
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
    `,
    [
      payload.actor_id ? String(payload.actor_id).trim() : null,
      normalizeText(payload.actor_role, 32),
      normalizeText(payload.action, 120),
      normalizeText(payload.resource_type, 120),
      normalizeText(payload.resource_id, 120),
      ["success", "failed"].includes(String(payload.status ?? "").trim())
        ? String(payload.status).trim()
        : "success",
      JSON.stringify(payload.detail ?? {}),
      normalizeText(payload.ip, 120)
    ]
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeIsoDate(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, "Invalid date format. Use ISO datetime.");
  }
  return date.toISOString();
}

export async function queryAuditLogs(params = {}, currentUser) {
  if (!currentUser?.id || currentUser?.role !== "admin") {
    throw httpError(403, "Only admin can view audit logs");
  }

  const limit = clamp(Number.parseInt(params.limit, 10) || 50, 1, 200);
  const offset = Math.max(Number.parseInt(params.offset, 10) || 0, 0);
  const action = normalizeText(params.action, 120);
  const resourceType = normalizeText(params.resource_type ?? params.resourceType, 120);
  const status = normalizeText(params.status, 16);
  const from = normalizeIsoDate(params.from);
  const to = normalizeIsoDate(params.to);

  const where = [];
  const values = [];

  if (action) {
    values.push(action);
    where.push(`action = $${values.length}`);
  }
  if (resourceType) {
    values.push(resourceType);
    where.push(`resource_type = $${values.length}`);
  }
  if (status) {
    values.push(status);
    where.push(`status = $${values.length}`);
  }
  if (from) {
    values.push(from);
    where.push(`created_at >= $${values.length}::timestamptz`);
  }
  if (to) {
    values.push(to);
    where.push(`created_at <= $${values.length}::timestamptz`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM audit_logs ${whereSql}`,
    values
  );

  const listValues = [...values, limit, offset];
  const list = await query(
    `
    SELECT
      id,
      actor_id,
      actor_role,
      action,
      resource_type,
      resource_id,
      status,
      detail,
      ip,
      created_at
    FROM audit_logs
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${listValues.length - 1}
    OFFSET $${listValues.length}
    `,
    listValues
  );

  return {
    total: countResult.rows[0]?.total ?? 0,
    limit,
    offset,
    items: list.rows
  };
}
