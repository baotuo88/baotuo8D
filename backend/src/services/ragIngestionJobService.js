import { httpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";
import { createAuditLog } from "./auditLogService.js";
import { enqueueRagIngestionJob, getRagIngestionJob } from "../queue/ragIngestionQueue.js";

function normalizeJobPayload(payload = {}) {
  const type = String(payload.type ?? "").trim();
  if (!["upload", "folder"].includes(type)) {
    throw httpError(400, "type must be upload or folder");
  }

  return {
    type,
    file_paths: Array.isArray(payload.file_paths)
      ? payload.file_paths.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
    files: Array.isArray(payload.files)
      ? payload.files.map((item) => ({
          path: String(item?.path ?? "").trim(),
          originalname: String(item?.originalname ?? "").trim()
        }))
      : [],
    folder_options:
      payload.folder_options && typeof payload.folder_options === "object"
        ? payload.folder_options
        : {},
    current_user: {
      id: String(payload.current_user?.id ?? "").trim(),
      role: String(payload.current_user?.role ?? "").trim()
    }
  };
}

export async function createRagIngestionJob(payload) {
  const normalized = normalizeJobPayload(payload);
  const job = await enqueueRagIngestionJob(normalized);

  await createAuditLog({
    actor_id: normalized.current_user.id || null,
    actor_role: normalized.current_user.role || "",
    action: "rag_ingestion_job.create",
    resource_type: "rag_ingestion_job",
    resource_id: String(job.id),
    status: "success",
    detail: {
      type: normalized.type,
      files_count: normalized.files.length,
      file_paths_count: normalized.file_paths.length,
      folder_options: normalized.folder_options
    }
  }).catch((error) => {
    logger.warn("audit_log_write_failed", {
      action: "rag_ingestion_job.create",
      error: error?.message || "unknown_error"
    });
  });

  return {
    job_id: job.id,
    queue: job.queueName,
    status: "waiting"
  };
}

export async function getRagIngestionJobStatus(jobId) {
  const job = await getRagIngestionJob(String(jobId ?? "").trim());
  if (!job) {
    throw httpError(404, "Job not found");
  }

  const state = await job.getState();
  const progress = job.progress ?? 0;

  return {
    job_id: job.id,
    name: job.name,
    state,
    progress: typeof progress === "number" ? progress : 0,
    attempts_made: job.attemptsMade,
    attempts_max: job.opts?.attempts ?? 1,
    failed_reason: job.failedReason || "",
    created_at: job.timestamp ? new Date(job.timestamp).toISOString() : null,
    processed_at: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finished_at: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    result: job.returnvalue ?? null
  };
}
