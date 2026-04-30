import { ROLES } from "../constants/roles.js";
import { query } from "../db/pool.js";
import { httpError } from "../utils/httpError.js";

const ALLOWED_RATINGS = new Set(["good", "normal", "bad"]);

function assertAuthedUser(user) {
  if (!user?.id || !user?.role) {
    throw httpError(401, "Authentication required");
  }
}

function normalizeText(value, maxLength = 2000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeUuid(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw httpError(400, `${fieldName} is required`);
  }

  return text;
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

async function assertGenerationLogVisible(logId, currentUser) {
  const result = await query(
    `
    SELECT id, user_id, scene, status, created_at
    FROM ai_generation_logs
    WHERE id = $1
    `,
    [logId]
  );

  if (result.rowCount === 0) {
    throw httpError(404, "generation log not found");
  }

  const row = result.rows[0];
  if (currentUser.role !== ROLES.ADMIN && row.user_id !== currentUser.id) {
    throw httpError(403, "Permission denied");
  }

  return row;
}

export async function upsertRagGenerationEvaluation(payload = {}, currentUser) {
  assertAuthedUser(currentUser);

  const generationLogId = normalizeUuid(
    payload.generationLogId ?? payload.generation_log_id,
    "generationLogId"
  );
  const rating = normalizeText(payload.rating, 16).toLowerCase();

  if (!ALLOWED_RATINGS.has(rating)) {
    throw httpError(400, "rating must be one of: good, normal, bad");
  }

  await assertGenerationLogVisible(generationLogId, currentUser);

  const result = await query(
    `
    INSERT INTO rag_generation_evaluations (
      generation_log_id,
      user_id,
      rating,
      comment
    )
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (generation_log_id, user_id)
    DO UPDATE SET
      rating = EXCLUDED.rating,
      comment = EXCLUDED.comment,
      updated_at = NOW()
    RETURNING id, generation_log_id, user_id, rating, comment, created_at, updated_at
    `,
    [
      generationLogId,
      currentUser.id,
      rating,
      normalizeText(payload.comment, 2000)
    ]
  );

  return result.rows[0];
}

export async function getRagEvaluationStats(params = {}, currentUser) {
  assertAuthedUser(currentUser);

  const scene = normalizeText(params.scene || "rag_generation", 120);
  const from = normalizeIsoDate(params.from);
  const to = normalizeIsoDate(params.to);
  const limit = clamp(Number.parseInt(params.limit, 10) || 20, 1, 100);
  const offset = Math.max(Number.parseInt(params.offset, 10) || 0, 0);

  const where = ["l.scene = $1"];
  const values = [scene];

  if (currentUser.role !== ROLES.ADMIN) {
    values.push(currentUser.id);
    where.push(`l.user_id = $${values.length}`);
  }

  if (from) {
    values.push(from);
    where.push(`l.created_at >= $${values.length}::timestamptz`);
  }

  if (to) {
    values.push(to);
    where.push(`l.created_at <= $${values.length}::timestamptz`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const aggResult = await query(
    `
    WITH base AS (
      SELECT
        l.id,
        l.status,
        l.retrieval_content,
        e.rating
      FROM ai_generation_logs l
      LEFT JOIN rag_generation_evaluations e
        ON e.generation_log_id = l.id
      ${whereSql}
    )
    SELECT
      COUNT(*)::int AS total_generated,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::int AS total_success,
      SUM(CASE WHEN status = 'success' AND jsonb_array_length(retrieval_content) > 0 THEN 1 ELSE 0 END)::int AS total_hit,
      SUM(CASE WHEN rating IS NOT NULL THEN 1 ELSE 0 END)::int AS total_rated,
      SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END)::int AS rating_good,
      SUM(CASE WHEN rating = 'normal' THEN 1 ELSE 0 END)::int AS rating_normal,
      SUM(CASE WHEN rating = 'bad' THEN 1 ELSE 0 END)::int AS rating_bad
    FROM base
    `,
    values
  );

  const row = aggResult.rows[0] ?? {};
  const totalGenerated = Number(row.total_generated || 0);
  const totalSuccess = Number(row.total_success || 0);
  const totalHit = Number(row.total_hit || 0);
  const totalRated = Number(row.total_rated || 0);
  const ratingGood = Number(row.rating_good || 0);
  const ratingNormal = Number(row.rating_normal || 0);
  const ratingBad = Number(row.rating_bad || 0);

  const hitRate = totalSuccess > 0 ? totalHit / totalSuccess : 0;
  const satisfactionRate = totalRated > 0 ? ratingGood / totalRated : 0;

  const listValues = [...values, limit, offset];
  const itemsResult = await query(
    `
    SELECT
      l.id AS generation_log_id,
      l.user_id,
      l.scene,
      l.status,
      l.duration_ms,
      l.created_at,
      CASE WHEN jsonb_array_length(l.retrieval_content) > 0 THEN TRUE ELSE FALSE END AS is_hit,
      e.rating,
      e.comment,
      e.updated_at AS rated_at
    FROM ai_generation_logs l
    LEFT JOIN rag_generation_evaluations e
      ON e.generation_log_id = l.id
    ${whereSql}
    ORDER BY l.created_at DESC
    LIMIT $${listValues.length - 1}
    OFFSET $${listValues.length}
    `,
    listValues
  );

  return {
    filter: {
      scene,
      from: from || null,
      to: to || null
    },
    metrics: {
      total_generated: totalGenerated,
      total_success: totalSuccess,
      total_hit: totalHit,
      hit_rate: Number(hitRate.toFixed(4)),
      total_rated: totalRated,
      rating_distribution: {
        good: ratingGood,
        normal: ratingNormal,
        bad: ratingBad
      },
      satisfaction_rate: Number(satisfactionRate.toFixed(4))
    },
    pagination: {
      limit,
      offset
    },
    items: itemsResult.rows
  };
}
