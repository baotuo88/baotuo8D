import { ROLES } from "../constants/roles.js";
import { pool } from "../db/pool.js";
import { query } from "../db/pool.js";
import { httpError } from "../utils/httpError.js";

const DEFAULT_SCENE = "rag_generation";
const REQUIRED_VARIABLES = ["context", "query"];

function assertAuthedUser(user) {
  if (!user?.id || !user?.role) {
    throw httpError(401, "Authentication required");
  }
}

function assertAdmin(user) {
  if (!user?.id || user.role !== ROLES.ADMIN) {
    throw httpError(403, "Only admin can update prompt templates");
  }
}

function normalizeScene(value) {
  const scene = String(value ?? DEFAULT_SCENE).trim() || DEFAULT_SCENE;
  if (scene.length > 120) {
    throw httpError(400, "scene must be <= 120 characters");
  }
  return scene;
}

function normalizeVersion(value) {
  const version = String(value ?? "").trim().toLowerCase();
  if (!["v1", "v2"].includes(version)) {
    throw httpError(400, "version must be v1 or v2");
  }
  return version;
}

function normalizeTemplate(value) {
  const template = String(value ?? "").trim();
  if (!template) {
    throw httpError(400, "template is required");
  }
  if (template.length > 20000) {
    throw httpError(400, "template must be <= 20000 characters");
  }
  return template;
}

function normalizeVariables(value) {
  const vars = Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : REQUIRED_VARIABLES;
  const uniq = Array.from(new Set(vars));
  for (const required of REQUIRED_VARIABLES) {
    if (!uniq.includes(required)) {
      throw httpError(400, `variables must include ${required}`);
    }
  }
  return uniq.slice(0, 50);
}

function ensureTemplateHasVariables(template, variables) {
  for (const variable of variables) {
    const token = `{${variable}}`;
    if (!template.includes(token)) {
      throw httpError(400, `template must include variable token ${token}`);
    }
  }
}

function mapTemplate(row) {
  return {
    id: row.id,
    scene: row.scene,
    version: row.version,
    template: row.template,
    variables: Array.isArray(row.variables) ? row.variables : [],
    is_current: row.is_current,
    updated_at: row.updated_at
  };
}

export async function getCurrentPromptTemplate(payload, currentUser) {
  assertAuthedUser(currentUser);
  const scene = normalizeScene(payload?.scene);
  const result = await query(
    `
    SELECT id, scene, version, template, variables, is_current, updated_at
    FROM prompt_templates
    WHERE scene = $1 AND is_current = TRUE
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [scene]
  );

  const row = result.rows[0];
  if (!row) {
    throw httpError(404, `Prompt template not found for scene ${scene}`);
  }
  return mapTemplate(row);
}

export async function updateCurrentPromptTemplate(payload, currentUser) {
  assertAdmin(currentUser);
  const scene = normalizeScene(payload?.scene);
  const version = normalizeVersion(payload?.version);
  const template = normalizeTemplate(payload?.template);
  const variables = normalizeVariables(payload?.variables);
  ensureTemplateHasVariables(template, variables);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
      INSERT INTO prompt_templates (
        scene, version, template, variables, is_current, created_by, updated_by
      )
      VALUES ($1, $2, $3, $4::jsonb, TRUE, $5, $5)
      ON CONFLICT (scene, version)
      DO UPDATE SET
        template = EXCLUDED.template,
        variables = EXCLUDED.variables,
        is_current = TRUE,
        updated_by = EXCLUDED.updated_by
      `,
      [scene, version, template, JSON.stringify(variables), currentUser.id]
    );

    await client.query(
      `
      UPDATE prompt_templates
      SET is_current = FALSE
      WHERE scene = $1 AND version <> $2 AND is_current = TRUE
      `,
      [scene, version]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getCurrentPromptTemplate({ scene }, currentUser);
}

export function renderPromptTemplate({ template, values }) {
  const source = String(template ?? "");
  const bag = values && typeof values === "object" ? values : {};
  return source.replace(/\{([a-zA-Z0-9_]+)\}/g, (_full, key) => {
    const value = bag[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
