import {
  EIGHT_D_APPROVAL_DECISIONS,
  EIGHT_D_STATUSES,
  EIGHT_D_STEP_COLUMNS,
  EIGHT_D_TRANSITIONS,
  VALID_EIGHT_D_APPROVAL_DECISIONS,
  VALID_EIGHT_D_STATUSES,
  VALID_EIGHT_D_STEPS
} from "../constants/eightDReport.js";
import { ROLES } from "../constants/roles.js";
import { pool, query } from "../db/pool.js";
import { httpError } from "../utils/httpError.js";

const MAX_TITLE_LENGTH = 200;
const MAX_STEP_LENGTH = 20000;
const MAX_COMMENT_LENGTH = 1000;

const REPORT_SELECT = `
  SELECT
    r.id,
    r.title,
    r.status,
    r.d1,
    r.d2,
    r.d3,
    r.d4,
    r.d5,
    r.d6,
    r.d7,
    r.d8,
    r.created_by AS creator_id,
    c.name AS creator_name,
    c.email AS creator_email,
    r.updated_by AS updater_id,
    u.name AS updater_name,
    u.email AS updater_email,
    r.created_at,
    r.updated_at,
    r.submitted_at,
    r.closed_at
  FROM eight_d_reports r
  JOIN users c ON c.id = r.created_by
  LEFT JOIN users u ON u.id = r.updated_by
`;

function isAdmin(user) {
  return user?.role === ROLES.ADMIN;
}

function assertAuthedUser(user) {
  if (!user?.id || !user?.role) {
    throw httpError(401, "Authentication required");
  }
}

function sanitizeTitle(value) {
  const title = String(value ?? "").trim();

  if (!title) {
    throw httpError(400, "title is required");
  }

  if (title.length > MAX_TITLE_LENGTH) {
    throw httpError(400, `title must be <= ${MAX_TITLE_LENGTH} characters`);
  }

  return title;
}

function sanitizeStepValue(value, fieldName) {
  const text = String(value ?? "").trim();

  if (text.length > MAX_STEP_LENGTH) {
    throw httpError(400, `${fieldName} must be <= ${MAX_STEP_LENGTH} characters`);
  }

  return text;
}

function sanitizeComment(value) {
  const comment = String(value ?? "").trim();

  if (comment.length > MAX_COMMENT_LENGTH) {
    throw httpError(400, `comment must be <= ${MAX_COMMENT_LENGTH} characters`);
  }

  return comment;
}

function normalizeStatus(value) {
  const status = String(value ?? "").trim().toLowerCase();

  if (!VALID_EIGHT_D_STATUSES.has(status)) {
    throw httpError(400, "Invalid status");
  }

  return status;
}

function normalizeDecision(value) {
  const decision = String(value ?? "").trim().toLowerCase();

  if (!VALID_EIGHT_D_APPROVAL_DECISIONS.has(decision)) {
    throw httpError(400, "Invalid decision");
  }

  return decision;
}

function normalizeStep(step) {
  const normalized = String(step ?? "").trim().toLowerCase();

  if (!VALID_EIGHT_D_STEPS.has(normalized)) {
    throw httpError(400, "Invalid step. step must be one of d1-d8");
  }

  return normalized;
}

function mapReportRow(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    d1: row.d1,
    d2: row.d2,
    d3: row.d3,
    d4: row.d4,
    d5: row.d5,
    d6: row.d6,
    d7: row.d7,
    d8: row.d8,
    creator: {
      id: row.creator_id,
      name: row.creator_name,
      email: row.creator_email
    },
    updater: row.updater_id
      ? {
          id: row.updater_id,
          name: row.updater_name,
          email: row.updater_email
        }
      : null,
    timestamps: {
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      submittedAt: row.submitted_at,
      closedAt: row.closed_at
    }
  };
}

async function getReportRowById(reportId, executor = query) {
  const result = await executor(
    `${REPORT_SELECT}
     WHERE r.id = $1
     LIMIT 1`,
    [reportId]
  );

  return result.rows[0] ?? null;
}

function assertCanRead(reportRow, currentUser) {
  if (isAdmin(currentUser) || reportRow.creator_id === currentUser.id) {
    return;
  }

  throw httpError(403, "Insufficient permissions");
}

function assertCanEditContent(reportRow, currentUser) {
  if (reportRow.status === EIGHT_D_STATUSES.CLOSED) {
    throw httpError(409, "Closed report cannot be edited");
  }

  if (isAdmin(currentUser)) {
    return;
  }

  if (reportRow.creator_id !== currentUser.id) {
    throw httpError(403, "Only creator can edit this report");
  }

  if (reportRow.status !== EIGHT_D_STATUSES.DRAFT) {
    throw httpError(409, "Creator can only edit report in draft status");
  }
}

function assertCanTransition(reportRow, currentUser, toStatus) {
  const fromStatus = reportRow.status;
  const candidates = EIGHT_D_TRANSITIONS[fromStatus] ?? [];

  if (!candidates.includes(toStatus)) {
    throw httpError(409, `Transition ${fromStatus} -> ${toStatus} is not allowed`);
  }

  const creator = reportRow.creator_id === currentUser.id;
  const admin = isAdmin(currentUser);

  if (fromStatus === EIGHT_D_STATUSES.DRAFT && toStatus === EIGHT_D_STATUSES.REVIEW) {
    if (creator || admin) {
      return;
    }

    throw httpError(403, "Only creator or admin can submit report for review");
  }

  if (
    fromStatus === EIGHT_D_STATUSES.REVIEW &&
    (toStatus === EIGHT_D_STATUSES.DRAFT || toStatus === EIGHT_D_STATUSES.CLOSED)
  ) {
    if (admin) {
      return;
    }

    throw httpError(403, "Only admin can approve/reject report in review");
  }

  if (fromStatus === EIGHT_D_STATUSES.CLOSED && toStatus === EIGHT_D_STATUSES.REVIEW) {
    if (admin) {
      return;
    }

    throw httpError(403, "Only admin can reopen closed report");
  }

  throw httpError(403, "Insufficient permissions");
}

async function insertStatusHistory(
  executor,
  { reportId, fromStatus, toStatus, actorId, comment }
) {
  await executor(
    `
    INSERT INTO eight_d_status_history (
      report_id,
      from_status,
      to_status,
      actor_id,
      comment
    )
    VALUES ($1, $2, $3, $4, $5)
    `,
    [reportId, fromStatus, toStatus, actorId, comment]
  );
}

async function performStatusTransition({
  reportId,
  fromStatus,
  toStatus,
  actorId,
  comment,
  approvalDecision = null
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const updateResult = await client.query(
      `
      UPDATE eight_d_reports
      SET
        status = $1,
        updated_by = $2,
        submitted_at = CASE
          WHEN $1 = 'review' AND status <> 'review' THEN NOW()
          ELSE submitted_at
        END,
        closed_at = CASE
          WHEN $1 = 'closed' THEN NOW()
          WHEN $1 = 'review' AND status = 'closed' THEN NULL
          ELSE closed_at
        END
      WHERE id = $3
      RETURNING id
      `,
      [toStatus, actorId, reportId]
    );

    if (!updateResult.rowCount) {
      throw httpError(404, "Report not found");
    }

    await insertStatusHistory(client.query.bind(client), {
      reportId,
      fromStatus,
      toStatus,
      actorId,
      comment
    });

    if (approvalDecision) {
      await client.query(
        `
        INSERT INTO eight_d_approvals (
          report_id,
          decision,
          comment,
          actor_id
        )
        VALUES ($1, $2, $3, $4)
        `,
        [reportId, approvalDecision, comment, actorId]
      );
    }

    const latest = await getReportRowById(reportId, client.query.bind(client));

    await client.query("COMMIT");

    return mapReportRow(latest);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createEightDReport(payload, currentUser) {
  assertAuthedUser(currentUser);

  const title = sanitizeTitle(payload?.title);
  const d1 = sanitizeStepValue(payload?.d1, "d1");
  const d2 = sanitizeStepValue(payload?.d2, "d2");
  const d3 = sanitizeStepValue(payload?.d3, "d3");
  const d4 = sanitizeStepValue(payload?.d4, "d4");
  const d5 = sanitizeStepValue(payload?.d5, "d5");
  const d6 = sanitizeStepValue(payload?.d6, "d6");
  const d7 = sanitizeStepValue(payload?.d7, "d7");
  const d8 = sanitizeStepValue(payload?.d8, "d8");

  const insertResult = await query(
    `
    INSERT INTO eight_d_reports (
      title,
      status,
      d1,
      d2,
      d3,
      d4,
      d5,
      d6,
      d7,
      d8,
      created_by,
      updated_by
    )
    VALUES ($1, 'draft', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id
    `,
    [title, d1, d2, d3, d4, d5, d6, d7, d8, currentUser.id, currentUser.id]
  );

  const reportId = insertResult.rows[0].id;

  const reportRow = await getReportRowById(reportId);
  return mapReportRow(reportRow);
}

export async function listEightDReports({ limit = 20, status }, currentUser) {
  assertAuthedUser(currentUser);

  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);

  const filters = [];
  const params = [];

  if (status) {
    const normalizedStatus = normalizeStatus(status);
    params.push(normalizedStatus);
    filters.push(`r.status = $${params.length}`);
  }

  if (!isAdmin(currentUser)) {
    params.push(currentUser.id);
    filters.push(`r.created_by = $${params.length}`);
  }

  params.push(safeLimit);

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const result = await query(
    `
    ${REPORT_SELECT}
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT $${params.length}
    `,
    params
  );

  return result.rows.map(mapReportRow);
}

export async function getEightDReportById(reportId, currentUser) {
  assertAuthedUser(currentUser);

  const reportRow = await getReportRowById(reportId);

  if (!reportRow) {
    throw httpError(404, "Report not found");
  }

  assertCanRead(reportRow, currentUser);

  return mapReportRow(reportRow);
}

export async function updateEightDReportTitle(reportId, payload, currentUser) {
  assertAuthedUser(currentUser);

  const title = sanitizeTitle(payload?.title);

  const reportRow = await getReportRowById(reportId);

  if (!reportRow) {
    throw httpError(404, "Report not found");
  }

  assertCanRead(reportRow, currentUser);
  assertCanEditContent(reportRow, currentUser);

  await query(
    `
    UPDATE eight_d_reports
    SET title = $1, updated_by = $2
    WHERE id = $3
    `,
    [title, currentUser.id, reportId]
  );

  const latest = await getReportRowById(reportId);
  return mapReportRow(latest);
}

export async function updateEightDReportStep(reportId, step, payload, currentUser) {
  assertAuthedUser(currentUser);

  const normalizedStep = normalizeStep(step);
  const columnName = EIGHT_D_STEP_COLUMNS[normalizedStep];
  const content = sanitizeStepValue(payload?.content, normalizedStep);

  const reportRow = await getReportRowById(reportId);

  if (!reportRow) {
    throw httpError(404, "Report not found");
  }

  assertCanRead(reportRow, currentUser);
  assertCanEditContent(reportRow, currentUser);

  await query(
    `
    UPDATE eight_d_reports
    SET ${columnName} = $1, updated_by = $2
    WHERE id = $3
    `,
    [content, currentUser.id, reportId]
  );

  const latest = await getReportRowById(reportId);
  return mapReportRow(latest);
}

export async function transitionEightDReportStatus(reportId, payload, currentUser) {
  assertAuthedUser(currentUser);

  const toStatus = normalizeStatus(payload?.status);
  const comment = sanitizeComment(payload?.comment);

  const reportRow = await getReportRowById(reportId);

  if (!reportRow) {
    throw httpError(404, "Report not found");
  }

  assertCanRead(reportRow, currentUser);
  assertCanTransition(reportRow, currentUser, toStatus);

  return performStatusTransition({
    reportId,
    fromStatus: reportRow.status,
    toStatus,
    actorId: currentUser.id,
    comment
  });
}

export async function approveEightDReport(reportId, payload, currentUser) {
  assertAuthedUser(currentUser);

  if (!isAdmin(currentUser)) {
    throw httpError(403, "Only admin can approve/reject report");
  }

  const decision = normalizeDecision(payload?.decision);
  const comment = sanitizeComment(payload?.comment);

  const reportRow = await getReportRowById(reportId);

  if (!reportRow) {
    throw httpError(404, "Report not found");
  }

  if (reportRow.status !== EIGHT_D_STATUSES.REVIEW) {
    throw httpError(409, "Only report in review status can be approved/rejected");
  }

  const toStatus =
    decision === EIGHT_D_APPROVAL_DECISIONS.APPROVED
      ? EIGHT_D_STATUSES.CLOSED
      : EIGHT_D_STATUSES.DRAFT;

  return performStatusTransition({
    reportId,
    fromStatus: reportRow.status,
    toStatus,
    actorId: currentUser.id,
    comment,
    approvalDecision: decision
  });
}

export async function listEightDReportApprovals(reportId, currentUser) {
  const report = await getEightDReportById(reportId, currentUser);

  const result = await query(
    `
    SELECT
      a.id,
      a.decision,
      a.comment,
      a.created_at,
      a.actor_id,
      u.name AS actor_name,
      u.email AS actor_email
    FROM eight_d_approvals a
    JOIN users u ON u.id = a.actor_id
    WHERE a.report_id = $1
    ORDER BY a.created_at DESC
    `,
    [report.id]
  );

  return result.rows.map((row) => ({
    id: row.id,
    decision: row.decision,
    comment: row.comment,
    actor: {
      id: row.actor_id,
      name: row.actor_name,
      email: row.actor_email
    },
    createdAt: row.created_at
  }));
}

export async function listEightDReportStatusHistory(reportId, currentUser) {
  const report = await getEightDReportById(reportId, currentUser);

  const result = await query(
    `
    SELECT
      h.id,
      h.from_status,
      h.to_status,
      h.comment,
      h.created_at,
      h.actor_id,
      u.name AS actor_name,
      u.email AS actor_email
    FROM eight_d_status_history h
    JOIN users u ON u.id = h.actor_id
    WHERE h.report_id = $1
    ORDER BY h.created_at DESC
    `,
    [report.id]
  );

  return result.rows.map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    comment: row.comment,
    actor: {
      id: row.actor_id,
      name: row.actor_name,
      email: row.actor_email
    },
    createdAt: row.created_at
  }));
}

export async function deleteEightDReport(reportId, currentUser) {
  assertAuthedUser(currentUser);

  const row = await getReportRowById(reportId);
  if (!row) {
    throw httpError(404, "Report not found");
  }

  if (!isAdmin(currentUser) && row.creator_id !== currentUser.id) {
    throw httpError(403, "Only creator or admin can delete this report");
  }

  if (row.status === EIGHT_D_STATUSES.CLOSED && !isAdmin(currentUser)) {
    throw httpError(409, "Only admin can delete a closed report");
  }

  await query("DELETE FROM eight_d_reports WHERE id = $1", [reportId]);
}
