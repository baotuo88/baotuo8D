import { query } from "../db/pool.js";

function mapProfileRow(row) {
  const profileJson = row.profile_json ?? {};

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    source_count: row.source_count,
    lexicon: row.lexicon ?? [],
    sentence_patterns: row.sentence_patterns ?? [],
    technical_terms: row.technical_terms ?? [],
    style_rules: row.style_rules ?? [],
    anti_template_rules: row.anti_template_rules ?? [],
    sample_phrases: row.sample_phrases ?? [],
    summary: profileJson.summary ?? "",
    profile_json: profileJson,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function createWritingStyleProfile(record) {
  const result = await query(
    `
    INSERT INTO writing_style_profiles (
      name,
      description,
      source_count,
      lexicon,
      sentence_patterns,
      technical_terms,
      style_rules,
      anti_template_rules,
      sample_phrases,
      profile_json,
      created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
    `,
    [
      record.name,
      record.description,
      record.source_count,
      JSON.stringify(record.lexicon ?? []),
      JSON.stringify(record.sentence_patterns ?? []),
      JSON.stringify(record.technical_terms ?? []),
      JSON.stringify(record.style_rules ?? []),
      JSON.stringify(record.anti_template_rules ?? []),
      JSON.stringify(record.sample_phrases ?? []),
      JSON.stringify(record.profile_json ?? {}),
      record.created_by
    ]
  );

  return mapProfileRow(result.rows[0]);
}

export async function getWritingStyleProfileById(profileId) {
  const result = await query(
    `
    SELECT *
    FROM writing_style_profiles
    WHERE id = $1
    LIMIT 1
    `,
    [profileId]
  );

  return result.rows[0] ? mapProfileRow(result.rows[0]) : null;
}

export async function getLatestWritingStyleProfile() {
  const result = await query(
    `
    SELECT *
    FROM writing_style_profiles
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
    `
  );

  return result.rows[0] ? mapProfileRow(result.rows[0]) : null;
}

export async function listWritingStyleProfiles(limit = 20) {
  const result = await query(
    `
    SELECT *
    FROM writing_style_profiles
    ORDER BY updated_at DESC, created_at DESC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows.map(mapProfileRow);
}
