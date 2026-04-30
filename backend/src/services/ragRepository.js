import { pool, query } from "../db/pool.js";

function mapCaseRow(row) {
  return {
    id: row.id,
    source_type: row.source_type,
    source_name: row.source_name,
    source_path: row.source_path,
    title: row.title,
    product: row.product,
    issue_type: row.issue_type,
    problem_type: row.problem_type,
    process: row.process,
    problem: row.problem,
    root_cause: row.root_cause,
    solution: row.solution,
    metadata: row.metadata ?? {},
    raw_text: row.raw_text,
    normalized_text: row.normalized_text,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function createRagCaseWithChunks({ caseRecord, chunks }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const caseResult = await client.query(
      `
      INSERT INTO rag_cases (
        source_type,
        source_name,
        source_path,
        title,
        product,
        issue_type,
        problem_type,
        process,
        problem,
        root_cause,
        solution,
        metadata,
        raw_text,
        normalized_text,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
      `,
      [
        caseRecord.source_type,
        caseRecord.source_name,
        caseRecord.source_path,
        caseRecord.title,
        caseRecord.product,
        caseRecord.issue_type,
        caseRecord.problem_type,
        caseRecord.process,
        caseRecord.problem,
        caseRecord.root_cause,
        caseRecord.solution,
        JSON.stringify(caseRecord.metadata ?? {}),
        caseRecord.raw_text,
        caseRecord.normalized_text,
        caseRecord.created_by
      ]
    );

    const ragCase = mapCaseRow(caseResult.rows[0]);
    const insertedChunks = [];

    for (const chunk of chunks) {
      const chunkResult = await client.query(
        `
        INSERT INTO rag_case_chunks (
          case_id,
          chunk_index,
          chunk_text,
          char_count,
          vector_id,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, case_id, chunk_index, chunk_text, char_count, vector_id, metadata, created_at
        `,
        [
          ragCase.id,
          chunk.chunk_index,
          chunk.chunk_text,
          chunk.char_count,
          chunk.vector_id,
          JSON.stringify(chunk.metadata ?? {})
        ]
      );

      insertedChunks.push(chunkResult.rows[0]);
    }

    await client.query("COMMIT");

    return {
      ragCase,
      chunks: insertedChunks
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getRagChunksByVectorIds(vectorIds) {
  if (!Array.isArray(vectorIds) || vectorIds.length === 0) {
    return [];
  }

  const result = await query(
    `
    SELECT
      c.id AS chunk_id,
      c.case_id,
      c.chunk_index,
      c.chunk_text,
      c.char_count,
      c.vector_id,
      c.metadata AS chunk_metadata,
      c.created_at AS chunk_created_at,
      r.id,
      r.source_type,
      r.source_name,
      r.source_path,
      r.title,
      r.product,
      r.issue_type,
      r.problem_type,
      r.process,
      r.problem,
      r.root_cause,
      r.solution,
      r.metadata,
      r.raw_text,
      r.normalized_text,
      r.created_by,
      r.created_at,
      r.updated_at
    FROM rag_case_chunks c
    JOIN rag_cases r ON r.id = c.case_id
    WHERE c.vector_id = ANY($1::text[])
    `,
    [vectorIds]
  );

  return result.rows.map((row) => ({
    chunk_id: row.chunk_id,
    case_id: row.case_id,
    chunk_index: row.chunk_index,
    chunk_text: row.chunk_text,
    char_count: row.char_count,
    vector_id: row.vector_id,
    chunk_metadata: row.chunk_metadata ?? {},
    chunk_created_at: row.chunk_created_at,
    case: mapCaseRow(row)
  }));
}

export async function deleteRagCaseById(caseId) {
  await query(
    `
    DELETE FROM rag_cases
    WHERE id = $1
    `,
    [caseId]
  );
}

export async function listRagCasesForKeywordSearch(filters = {}, limit = 300) {
  const values = [];
  const where = [];

  const normalizedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 300, 1), 1000);

  const product = String(filters.product ?? "").trim();
  const issueType = String(filters.issue_type ?? filters.problem_type ?? "").trim();
  const process = String(filters.process ?? "").trim();

  if (product) {
    values.push(product);
    where.push(`product = $${values.length}`);
  }

  if (issueType) {
    values.push(issueType);
    where.push(`(issue_type = $${values.length} OR problem_type = $${values.length})`);
  }

  if (process) {
    values.push(process);
    where.push(`process = $${values.length}`);
  }

  values.push(normalizedLimit);
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const result = await query(
    `
    SELECT
      id,
      source_type,
      source_name,
      source_path,
      title,
      product,
      issue_type,
      problem_type,
      process,
      problem,
      root_cause,
      solution,
      metadata,
      raw_text,
      normalized_text,
      created_by,
      created_at,
      updated_at
    FROM rag_cases
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${values.length}
    `,
    values
  );

  return result.rows.map(mapCaseRow);
}
