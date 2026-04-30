import OpenAI from "openai";
import { env } from "../config/env.js";
import { parseJsonFromModel } from "../utils/json.js";
import { logger } from "../utils/logger.js";
import { buildEightDPrompt } from "../utils/prompt.js";
import { getRuntimeAiProviderChain } from "./aiConfigService.js";

function createClient({ apiKey, baseURL }) {
  return new OpenAI({
    apiKey,
    baseURL
  });
}

function isRetryableError(error) {
  const status = Number(error?.status ?? error?.response?.status ?? 0);
  if ([408, 409, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }
  const code = String(error?.code ?? "").toLowerCase();
  return ["etimedout", "econnreset", "eai_again", "ecanceled", "aborted"].includes(code);
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`AI request timeout after ${timeoutMs}ms`);
      error.code = "ETIMEDOUT";
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function executeWithFailover({ channel, operation }) {
  const providers = await getRuntimeAiProviderChain();
  const timeoutMs = Math.max(env.aiRequestTimeoutMs, 1000);
  const retryCount = Math.max(env.aiRetryCount, 0);
  const errors = [];

  for (const provider of providers) {
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const startedAt = Date.now();
        const result = await withTimeout(operation(provider), timeoutMs);
        logger.info("ai_request_success", {
          channel,
          provider: provider.name,
          attempt: attempt + 1,
          duration_ms: Date.now() - startedAt
        });
        return result;
      } catch (error) {
        const retryable = isRetryableError(error);
        const errorInfo = {
          channel,
          provider: provider.name,
          attempt: attempt + 1,
          retryable,
          status: error?.status ?? error?.response?.status ?? null,
          code: error?.code ?? null,
          message: error?.message ?? "unknown_error"
        };
        errors.push(errorInfo);
        logger.warn("ai_request_failed", errorInfo);

        if (!retryable || attempt >= retryCount) {
          break;
        }
      }
    }
  }

  const finalError = new Error("All AI providers failed");
  finalError.details = errors;
  logger.error("ai_all_providers_failed", {
    channel,
    attempts: errors.length,
    errors
  });
  throw finalError;
}

async function createChatCompletion({ systemPrompt, userPrompt, temperature = 0.2 }) {
  return executeWithFailover({
    channel: "chat",
    operation: async (provider) => {
      const client = createClient(provider.chat);
      const response = await client.chat.completions.create({
        model: provider.chat.model,
        temperature,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ]
      });
      return response.choices?.[0]?.message?.content ?? "";
    }
  });
}

export async function generateJson({ systemPrompt, userPrompt, temperature = 0.2 }) {
  const content = await createChatCompletion({
    systemPrompt,
    userPrompt,
    temperature
  });

  return parseJsonFromModel(content);
}

export async function generateText({ systemPrompt, userPrompt, temperature = 0.2 }) {
  return createChatCompletion({
    systemPrompt,
    userPrompt,
    temperature
  });
}

export async function generateEightDReport(input) {
  return generateJson({
    systemPrompt: "You are an enterprise quality engineer. Return strict JSON only.",
    userPrompt: buildEightDPrompt(input),
    temperature: 0.2
  });
}

export async function createEmbeddings(texts) {
  const inputs = Array.isArray(texts)
    ? texts.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [String(texts ?? "").trim()].filter(Boolean);

  if (inputs.length === 0) {
    return [];
  }

  const response = await executeWithFailover({
    channel: "embedding",
    operation: async (provider) => {
      const client = createClient(provider.embedding);
      return client.embeddings.create({
        model: provider.embedding.model,
        input: inputs
      });
    }
  });

  return response.data?.map((item) => item.embedding ?? []) ?? [];
}

export async function createEmbedding(text) {
  const embeddings = await createEmbeddings([text]);
  return embeddings[0] ?? [];
}
