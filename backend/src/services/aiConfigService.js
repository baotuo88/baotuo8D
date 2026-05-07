import { env } from "../config/env.js";
import { ROLES } from "../constants/roles.js";
import { query } from "../db/pool.js";
import { httpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "../utils/crypto.js";
import { createAuditLog } from "./auditLogService.js";

const AI_CONFIG_ID = 1;

function assertAdmin(user) {
  if (!user?.id || user.role !== ROLES.ADMIN) {
    throw httpError(403, "Only admin can manage AI config");
  }
}

function maskSecret(secret) {
  if (!secret) {
    return "";
  }

  if (secret.length <= 8) {
    return `${secret.slice(0, 1)}***${secret.slice(-1)}`;
  }

  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

function normalizeRequiredText(value, fieldName, maxLength = 2048) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw httpError(400, `${fieldName} is required`);
  }

  if (text.length > maxLength) {
    throw httpError(400, `${fieldName} must be <= ${maxLength} characters`);
  }

  return text;
}

function normalizeUrl(value, fieldName) {
  const url = normalizeRequiredText(value, fieldName, 2048);

  let parsed;

  try {
    parsed = new URL(url);
  } catch (_error) {
    throw httpError(400, `${fieldName} must be a valid URL`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw httpError(400, `${fieldName} must use http or https`);
  }

  return url.replace(/\/+$/, "");
}

function normalizeConfigInput(payload) {
  return {
    chat_api_key: normalizeRequiredText(payload.chat_api_key, "chat_api_key"),
    chat_base_url: normalizeUrl(payload.chat_base_url, "chat_base_url"),
    chat_model: normalizeRequiredText(payload.chat_model, "chat_model", 256),
    embed_api_key: normalizeRequiredText(payload.embed_api_key, "embed_api_key"),
    embed_base_url: normalizeUrl(payload.embed_base_url, "embed_base_url"),
    embed_model: normalizeRequiredText(payload.embed_model, "embed_model", 256)
  };
}

async function ensureConfigRow() {
  await query(
    `
    INSERT INTO ai_runtime_config (
      id,
      chat_api_key,
      chat_base_url,
      chat_model,
      embed_api_key,
      embed_base_url,
      embed_model
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO NOTHING
    `,
    [
      AI_CONFIG_ID,
      env.openaiApiKey,
      env.openaiBaseUrl,
      env.openaiModel,
      env.openaiApiKey,
      env.openaiBaseUrl,
      env.embeddingModel
    ]
  );

  const result = await query(
    `
    SELECT id, chat_api_key, embed_api_key
    FROM ai_runtime_config
    WHERE id = $1
    LIMIT 1
    `,
    [AI_CONFIG_ID]
  );

  const row = result.rows[0];
  if (!row) {
    return;
  }

  const needsUpgrade = !isEncryptedSecret(row.chat_api_key) || !isEncryptedSecret(row.embed_api_key);
  if (!needsUpgrade) {
    return;
  }

  await query(
    `
    UPDATE ai_runtime_config
    SET
      chat_api_key = $2,
      embed_api_key = $3
    WHERE id = $1
    `,
    [
      AI_CONFIG_ID,
      encryptSecret(row.chat_api_key),
      encryptSecret(row.embed_api_key)
    ]
  );
}

async function getConfigRow() {
  await ensureConfigRow();

  const result = await query(
    `
    SELECT
      c.id,
      c.chat_api_key,
      c.chat_base_url,
      c.chat_model,
      c.embed_api_key,
      c.embed_base_url,
      c.embed_model,
      c.created_by,
      c.updated_by,
      c.created_at,
      c.updated_at,
      u.name AS updated_by_name,
      u.email AS updated_by_email
    FROM ai_runtime_config c
    LEFT JOIN users u ON u.id = c.updated_by
    WHERE c.id = $1
    LIMIT 1
    `,
    [AI_CONFIG_ID]
  );

  const row = result.rows[0];

  if (!row) {
    throw httpError(500, "AI config row is missing");
  }

  return row;
}

function toAdminView(row) {
  return {
    chat_api_key_masked: maskSecret(row.chat_api_key),
    chat_api_key_configured: Boolean(row.chat_api_key),
    chat_base_url: row.chat_base_url,
    chat_model: row.chat_model,
    embed_api_key_masked: maskSecret(row.embed_api_key),
    embed_api_key_configured: Boolean(row.embed_api_key),
    embed_base_url: row.embed_base_url,
    embed_model: row.embed_model,
    updated_by: row.updated_by
      ? {
          id: row.updated_by,
          name: row.updated_by_name,
          email: row.updated_by_email
        }
      : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function toProviderAdminView(row) {
  return {
    id: row.id,
    provider_name: row.provider_name,
    priority: row.priority,
    enabled: row.enabled,
    chat_api_key_masked: maskSecret(row.chat_api_key),
    chat_api_key_configured: Boolean(row.chat_api_key),
    chat_base_url: row.chat_base_url,
    chat_model: row.chat_model,
    embed_api_key_masked: maskSecret(row.embed_api_key),
    embed_api_key_configured: Boolean(row.embed_api_key),
    embed_base_url: row.embed_base_url,
    embed_model: row.embed_model,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function assertRuntimeField(value, fieldName, fallbackValue = "") {
  const text = String(value ?? "").trim();
  if (text) {
    return text;
  }

  const fallback = String(fallbackValue ?? "").trim();
  if (fallback) {
    return fallback;
  }

  throw httpError(500, `AI config field ${fieldName} is missing`);
}

export async function getAiConfigForAdmin(currentUser) {
  assertAdmin(currentUser);
  const row = await getConfigRow();
  return toAdminView(row);
}

export async function updateAiConfig(payload, currentUser) {
  assertAdmin(currentUser);

  const input = normalizeConfigInput(payload ?? {});

  await query(
    `
    INSERT INTO ai_runtime_config (
      id,
      chat_api_key,
      chat_base_url,
      chat_model,
      embed_api_key,
      embed_base_url,
      embed_model,
      created_by,
      updated_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
    ON CONFLICT (id)
    DO UPDATE SET
      chat_api_key = EXCLUDED.chat_api_key,
      chat_base_url = EXCLUDED.chat_base_url,
      chat_model = EXCLUDED.chat_model,
      embed_api_key = EXCLUDED.embed_api_key,
      embed_base_url = EXCLUDED.embed_base_url,
      embed_model = EXCLUDED.embed_model,
      updated_by = EXCLUDED.updated_by
    `,
    [
      AI_CONFIG_ID,
      encryptSecret(input.chat_api_key),
      input.chat_base_url,
      input.chat_model,
      encryptSecret(input.embed_api_key),
      input.embed_base_url,
      input.embed_model,
      currentUser.id
    ]
  );

  const row = await getConfigRow();

  await createAuditLog({
    actor_id: currentUser.id,
    actor_role: currentUser.role,
    action: "ai_config.update",
    resource_type: "ai_runtime_config",
    resource_id: String(AI_CONFIG_ID),
    status: "success",
    detail: {
      chat_base_url: input.chat_base_url,
      chat_model: input.chat_model,
      embed_base_url: input.embed_base_url,
      embed_model: input.embed_model
    }
  }).catch((error) => {
    logger.warn("audit_log_write_failed", {
      action: "ai_config.update",
      error: error?.message || "unknown_error"
    });
  });

  return toAdminView(row);
}

export async function listAiProviderConfigs(currentUser) {
  assertAdmin(currentUser);
  const result = await query(
    `
    SELECT
      id,
      provider_name,
      priority,
      enabled,
      chat_api_key,
      chat_base_url,
      chat_model,
      embed_api_key,
      embed_base_url,
      embed_model,
      created_at,
      updated_at
    FROM ai_provider_configs
    ORDER BY priority ASC, created_at ASC
    `
  );

  return result.rows.map((row) => toProviderAdminView(row));
}

function normalizeProviderInput(payload) {
  return {
    provider_name: normalizeRequiredText(payload.provider_name, "provider_name", 120),
    priority: Number.isFinite(Number(payload.priority)) ? Number(payload.priority) : 1,
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : true,
    chat_api_key: normalizeRequiredText(payload.chat_api_key, "chat_api_key"),
    chat_base_url: normalizeUrl(payload.chat_base_url, "chat_base_url"),
    chat_model: normalizeRequiredText(payload.chat_model, "chat_model", 256),
    embed_api_key: normalizeRequiredText(payload.embed_api_key, "embed_api_key"),
    embed_base_url: normalizeUrl(payload.embed_base_url, "embed_base_url"),
    embed_model: normalizeRequiredText(payload.embed_model, "embed_model", 256)
  };
}

export async function upsertAiProviderConfig(payload, currentUser) {
  assertAdmin(currentUser);
  const input = normalizeProviderInput(payload ?? {});

  await query(
    `
    INSERT INTO ai_provider_configs (
      provider_name,
      priority,
      enabled,
      chat_api_key,
      chat_base_url,
      chat_model,
      embed_api_key,
      embed_base_url,
      embed_model,
      created_by,
      updated_by
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
    ON CONFLICT (provider_name)
    DO UPDATE SET
      priority = EXCLUDED.priority,
      enabled = EXCLUDED.enabled,
      chat_api_key = EXCLUDED.chat_api_key,
      chat_base_url = EXCLUDED.chat_base_url,
      chat_model = EXCLUDED.chat_model,
      embed_api_key = EXCLUDED.embed_api_key,
      embed_base_url = EXCLUDED.embed_base_url,
      embed_model = EXCLUDED.embed_model,
      updated_by = EXCLUDED.updated_by
    `,
    [
      input.provider_name,
      input.priority,
      input.enabled,
      encryptSecret(input.chat_api_key),
      input.chat_base_url,
      input.chat_model,
      encryptSecret(input.embed_api_key),
      input.embed_base_url,
      input.embed_model,
      currentUser.id
    ]
  );

  await createAuditLog({
    actor_id: currentUser.id,
    actor_role: currentUser.role,
    action: "ai_provider.upsert",
    resource_type: "ai_provider_configs",
    resource_id: input.provider_name,
    status: "success",
    detail: {
      provider_name: input.provider_name,
      priority: input.priority,
      enabled: input.enabled,
      chat_base_url: input.chat_base_url,
      chat_model: input.chat_model,
      embed_base_url: input.embed_base_url,
      embed_model: input.embed_model
    }
  }).catch((error) => {
    logger.warn("audit_log_write_failed", {
      action: "ai_provider.upsert",
      error: error?.message || "unknown_error"
    });
  });

  return listAiProviderConfigs(currentUser);
}

export async function getRuntimeChatConfig() {
  const row = await getConfigRow();

  return {
    apiKey: assertRuntimeField(decryptSecret(row.chat_api_key), "chat_api_key", env.openaiApiKey),
    baseURL: assertRuntimeField(row.chat_base_url, "chat_base_url", env.openaiBaseUrl),
    model: assertRuntimeField(row.chat_model, "chat_model", env.openaiModel)
  };
}

export async function getRuntimeEmbeddingConfig() {
  const row = await getConfigRow();

  return {
    apiKey: assertRuntimeField(
      decryptSecret(row.embed_api_key),
      "embed_api_key",
      env.openaiApiKey
    ),
    baseURL: assertRuntimeField(row.embed_base_url, "embed_base_url", env.openaiBaseUrl),
    model: assertRuntimeField(row.embed_model, "embed_model", env.embeddingModel)
  };
}

export async function getRuntimeAiProviderChain() {
  const result = await query(
    `
    SELECT
      provider_name,
      priority,
      enabled,
      chat_api_key,
      chat_base_url,
      chat_model,
      embed_api_key,
      embed_base_url,
      embed_model
    FROM ai_provider_configs
    WHERE enabled = TRUE
    ORDER BY priority ASC, created_at ASC
    `
  );

  const providers = result.rows
    .map((row) => ({
      name: row.provider_name,
      priority: row.priority,
      chat: {
        apiKey: decryptSecret(String(row.chat_api_key ?? "").trim()),
        baseURL: String(row.chat_base_url ?? "").trim(),
        model: String(row.chat_model ?? "").trim()
      },
      embedding: {
        apiKey: decryptSecret(String(row.embed_api_key ?? "").trim()),
        baseURL: String(row.embed_base_url ?? "").trim(),
        model: String(row.embed_model ?? "").trim()
      }
    }))
    .filter(
      (item) =>
        item.chat.apiKey &&
        item.chat.baseURL &&
        item.chat.model &&
        item.embedding.apiKey &&
        item.embedding.baseURL &&
        item.embedding.model
    );

  if (providers.length > 0) {
    return providers;
  }

  const chat = await getRuntimeChatConfig();
  const embedding = await getRuntimeEmbeddingConfig();
  return [
    {
      name: "legacy-default",
      priority: 1,
      chat,
      embedding
    }
  ];
}
