import dotenv from "dotenv";

dotenv.config();

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: toInt(process.env.PORT, 8080),
  logLevel: process.env.LOG_LEVEL ?? "info",
  logPretty: ["1", "true", "yes"].includes(
    String(process.env.LOG_PRETTY ?? "").trim().toLowerCase()
  ),
  serviceName: process.env.SERVICE_NAME ?? "eightd-backend",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@postgres:5432/eightd_ai",
  chromaUrl: process.env.CHROMA_URL ?? "http://chroma:8000",
  chromaCollection: process.env.CHROMA_COLLECTION ?? "eight_d_reports",
  chromaReportCollection:
    process.env.CHROMA_REPORT_COLLECTION ??
    process.env.CHROMA_COLLECTION ??
    "eight_d_reports",
  chromaRagCollection: process.env.CHROMA_RAG_COLLECTION ?? "rag_case_chunks",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  aiRequestTimeoutMs: toInt(process.env.AI_REQUEST_TIMEOUT_MS, 25000),
  aiRetryCount: toInt(process.env.AI_RETRY_COUNT, 1),
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  queueRagIngestionName: process.env.QUEUE_RAG_INGESTION_NAME ?? "rag-ingestion",
  queueRagIngestionConcurrency: toInt(process.env.QUEUE_RAG_INGESTION_CONCURRENCY, 2),
  queueRagIngestionAttempts: toInt(process.env.QUEUE_RAG_INGESTION_ATTEMPTS, 3),
  jwtSecret: process.env.JWT_SECRET ?? "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 12),
  adminRegisterToken: process.env.ADMIN_REGISTER_TOKEN ?? "",
  documentUploadDir: process.env.DOCUMENT_UPLOAD_DIR ?? "/tmp/8d-doc-upload",
  documentImportRoot: process.env.DOCUMENT_IMPORT_ROOT ?? "/tmp",
  documentBatchConcurrency: toInt(process.env.DOCUMENT_BATCH_CONCURRENCY, 4),
  documentMaxUploadFiles: toInt(process.env.DOCUMENT_MAX_UPLOAD_FILES, 50),
  documentMaxImportFiles: toInt(process.env.DOCUMENT_MAX_IMPORT_FILES, 1000),
  documentMaxUploadFileSizeMB: toInt(process.env.DOCUMENT_MAX_UPLOAD_FILE_SIZE_MB, 20),
  ragChunkMinChars: toInt(process.env.RAG_CHUNK_MIN_CHARS, 300),
  ragChunkMaxChars: toInt(process.env.RAG_CHUNK_MAX_CHARS, 500),
  ragRecallLimit: toInt(process.env.RAG_RECALL_LIMIT, 10),
  ragTopCaseLimit: toInt(process.env.RAG_TOP_CASE_LIMIT, 3),
  healthcheckTimeoutMs: toInt(process.env.HEALTHCHECK_TIMEOUT_MS, 3000),
  securityEnableHelmet: toBool(process.env.SECURITY_ENABLE_HELMET, true),
  securityGlobalRateWindowMs: toInt(process.env.SECURITY_GLOBAL_RATE_WINDOW_MS, 60000),
  securityGlobalRateMax: toInt(process.env.SECURITY_GLOBAL_RATE_MAX, 300),
  securityAuthRateWindowMs: toInt(process.env.SECURITY_AUTH_RATE_WINDOW_MS, 60000),
  securityAuthRateMax: toInt(process.env.SECURITY_AUTH_RATE_MAX, 20),
  metricsToken: String(process.env.METRICS_TOKEN ?? "").trim()
};
