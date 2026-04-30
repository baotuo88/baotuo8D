import { ROLES } from "../constants/roles.js";
import { query } from "../db/pool.js";
import { httpError } from "../utils/httpError.js";

function assertAuthedUser(user) {
  if (!user?.id || !user?.role) {
    throw httpError(401, "Authentication required");
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeText(value, maxLength = 10000) {
  return String(value ?? "").trim().slice(0, maxLength);
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

export async function createAiGenerationLog(payload = {}) {
  const userId = payload.user_id ? String(payload.user_id).trim() : null;
  const scene = normalizeText(payload.scene || "rag_generation", 120);
  const durationMs = clamp(Number.parseInt(payload.duration_ms, 10) || 0, 0, 60 * 60 * 1000);
  const status = ["success", "failed"].includes(String(payload.status ?? "").trim())
    ? String(payload.status).trim()
    : "success";

  const result = await query(
    `
    INSERT INTO ai_generation_logs (
      user_id,
      scene,
      user_input,
      retrieval_content,
      prompt_content,
      ai_output,
      report_text,
      duration_ms,
      status,
      error_message
    )
    VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6::jsonb,$7,$8,$9,$10)
    RETURNING id, user_id, scene, status, created_at
    `,
    [
      userId || null,
      scene,
      JSON.stringify(payload.user_input ?? {}),
      JSON.stringify(payload.retrieval_content ?? []),
      normalizeText(payload.prompt_content, 200000),
      JSON.stringify(payload.ai_output ?? {}),
      normalizeText(payload.report_text, 200000),
      durationMs,
      status,
      normalizeText(payload.error_message, 2000)
    ]
  );

  return result.rows[0];
}

export async function queryAiGenerationLogs(params = {}, currentUser) {
  assertAuthedUser(currentUser);

  const limit = clamp(Number.parseInt(params.limit, 10) || 20, 1, 100);
  const offset = Math.max(Number.parseInt(params.offset, 10) || 0, 0);
  const scene = normalizeText(params.scene, 120);
  const status = normalizeText(params.status, 32);
  const keyword = normalizeText(params.keyword, 200);
  const from = normalizeIsoDate(params.from);
  const to = normalizeIsoDate(params.to);
  const minDurationMs = clamp(Number.parseInt(params.minDurationMs, 10) || 0, 0, 60 * 60 * 1000);
  const maxDurationRaw = Number.parseInt(params.maxDurationMs, 10);
  const maxDurationMs = Number.isFinite(maxDurationRaw)
    ? clamp(maxDurationRaw, 0, 60 * 60 * 1000)
    : null;

  if (maxDurationMs !== null && minDurationMs > maxDurationMs) {
    throw httpError(400, "minDurationMs should be <= maxDurationMs");
  }

  const where = [];
  const values = [];

  if (currentUser.role !== ROLES.ADMIN) {
    values.push(currentUser.id);
    where.push(`user_id = $${values.length}`);
  }

  if (scene) {
    values.push(scene);
    where.push(`scene = $${values.length}`);
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

  if (minDurationMs > 0) {
    values.push(minDurationMs);
    where.push(`duration_ms >= $${values.length}`);
  }

  if (maxDurationMs !== null) {
    values.push(maxDurationMs);
    where.push(`duration_ms <= $${values.length}`);
  }

  if (keyword) {
    values.push(`%${keyword}%`);
    const placeholder = `$${values.length}`;
    where.push(`(
      prompt_content ILIKE ${placeholder}
      OR report_text ILIKE ${placeholder}
      OR error_message ILIKE ${placeholder}
      OR user_input::text ILIKE ${placeholder}
      OR retrieval_content::text ILIKE ${placeholder}
      OR ai_output::text ILIKE ${placeholder}
    )`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM ai_generation_logs
    ${whereSql}
    `,
    values
  );

  const listValues = [...values, limit, offset];
  const result = await query(
    `
    SELECT
      id,
      user_id,
      scene,
      user_input,
      retrieval_content,
      prompt_content,
      ai_output,
      report_text,
      duration_ms,
      status,
      error_message,
      created_at
    FROM ai_generation_logs
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
    items: result.rows
  };
}
