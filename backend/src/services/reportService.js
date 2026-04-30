import { ROLES } from "../constants/roles.js";
import { query } from "../db/pool.js";
import { httpError } from "../utils/httpError.js";
import { upsertReportVector, querySimilarReports } from "./chromaService.js";
import { createEmbedding, generateEightDReport } from "./openaiService.js";

function normalizeInput(payload) {
  return {
    title: payload.title?.trim() ?? "",
    problemStatement: payload.problemStatement?.trim() ?? "",
    impact: payload.impact?.trim() ?? "",
    rootCauseHint: payload.rootCauseHint?.trim() ?? "",
    teamMembers: Array.isArray(payload.teamMembers)
      ? payload.teamMembers.map((x) => String(x).trim()).filter(Boolean)
      : []
  };
}

function assertAuthedUser(user) {
  if (!user?.id || !user?.role) {
    throw httpError(401, "Authentication required");
  }
}

function toVectorText(input, reportJson) {
  return [
    `Title: ${reportJson.title ?? input.title}`,
    `Summary: ${reportJson.summary ?? ""}`,
    `Problem: ${input.problemStatement}`,
    `Root cause: ${reportJson.d4_root_cause ?? ""}`,
    `Corrective actions: ${reportJson.d5_corrective_actions ?? ""}`
  ].join("\n");
}

function mapReportRow(row) {
  return {
    id: row.id,
    title: row.title,
    problem_statement: row.problem_statement,
    impact: row.impact,
    root_cause_hint: row.root_cause_hint,
    team_members: row.team_members,
    report_json: row.report_json,
    summary: row.summary,
    created_at: row.created_at,
    owner: row.owner_id
      ? {
          id: row.owner_id,
          name: row.owner_name,
          email: row.owner_email
        }
      : null
  };
}

export async function createReport(payload, currentUser) {
  assertAuthedUser(currentUser);

  const input = normalizeInput(payload);

  if (!input.title || !input.problemStatement) {
    throw httpError(400, "title and problemStatement are required");
  }

  const reportJson = await generateEightDReport(input);
  const vectorText = toVectorText(input, reportJson);
  const embedding = await createEmbedding(vectorText);

  const insertResult = await query(
    `
    INSERT INTO reports (
      created_by,
      title,
      problem_statement,
      impact,
      root_cause_hint,
      team_members,
      raw_input,
      report_json,
      summary
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, created_by, title, problem_statement, impact, root_cause_hint, team_members, report_json, summary, created_at
    `,
    [
      currentUser.id,
      input.title,
      input.problemStatement,
      input.impact,
      input.rootCauseHint,
      JSON.stringify(input.teamMembers),
      JSON.stringify(input),
      JSON.stringify(reportJson),
      reportJson.summary ?? ""
    ]
  );

  const report = insertResult.rows[0];

  await upsertReportVector({
    id: report.id,
    document: vectorText,
    metadata: {
      title: report.title,
      ownerId: currentUser.id,
      createdAt: report.created_at.toISOString()
    },
    embedding
  });

  return {
    ...report,
    owner: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email
    }
  };
}

export async function listReports(limit = 20, currentUser) {
  assertAuthedUser(currentUser);

  const safeLimit = Math.min(limit, 100);

  if (currentUser.role === ROLES.ADMIN) {
    const result = await query(
      `
      SELECT
        r.id,
        r.title,
        r.problem_statement,
        r.impact,
        r.root_cause_hint,
        r.team_members,
        r.report_json,
        r.summary,
        r.created_at,
        u.id AS owner_id,
        u.name AS owner_name,
        u.email AS owner_email
      FROM reports r
      LEFT JOIN users u ON r.created_by = u.id
      ORDER BY r.created_at DESC
      LIMIT $1
      `,
      [safeLimit]
    );

    return result.rows.map(mapReportRow);
  }

  const result = await query(
    `
    SELECT
      r.id,
      r.title,
      r.problem_statement,
      r.impact,
      r.root_cause_hint,
      r.team_members,
      r.report_json,
      r.summary,
      r.created_at,
      u.id AS owner_id,
      u.name AS owner_name,
      u.email AS owner_email
    FROM reports r
    JOIN users u ON r.created_by = u.id
    WHERE r.created_by = $1
    ORDER BY r.created_at DESC
    LIMIT $2
    `,
    [currentUser.id, safeLimit]
  );

  return result.rows.map(mapReportRow);
}

export async function semanticSearch(text, limit = 5, currentUser) {
  assertAuthedUser(currentUser);

  if (!text?.trim()) {
    return [];
  }

  const embedding = await createEmbedding(text.trim());

  return querySimilarReports({
    embedding,
    limit,
    ownerId: currentUser.role === ROLES.ADMIN ? "" : currentUser.id
  });
}
