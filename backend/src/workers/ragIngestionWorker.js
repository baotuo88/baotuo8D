import { Worker } from "bullmq";
import fsPromises from "fs/promises";
import path from "path";
import { env } from "../config/env.js";
import { processSingleDocument, importDocumentsFromFolder } from "../services/documentProcessingService.js";
import { ingestProcessedDocuments } from "../services/ragIngestionService.js";
import { redisConnection } from "../queue/redis.js";
import { logger } from "../utils/logger.js";

function safeName(filePath) {
  return path.basename(String(filePath ?? "").trim());
}

async function processUploadJob(job) {
  const files = Array.isArray(job.data?.files) ? job.data.files : [];
  const user = job.data?.current_user;
  const results = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const filePath = file.path;
    const fileName = file.originalname || safeName(file.path);

    try {
      const processed = await processSingleDocument({
        source: "queue-upload",
        filePath,
        fileName,
        includeText: true
      });
      results.push(processed);
    } catch (error) {
      results.push({
        source: "queue-upload",
        file_name: fileName,
        file_path: filePath,
        status: "error",
        error: error?.message || "Document processing failed"
      });
    } finally {
      if (filePath) {
        await fsPromises.unlink(filePath).catch(() => {});
      }
    }

    const progress = Math.floor(((index + 1) / Math.max(files.length, 1)) * 70);
    await job.updateProgress(progress);
  }

  const indexed = await ingestProcessedDocuments(
    {
      summary: {
        total: results.length,
        success: results.filter((item) => item.status === "success").length,
        failed: results.filter((item) => item.status === "error").length
      },
      results
    },
    user
  );

  await job.updateProgress(100);
  return {
    type: "upload",
    processing: {
      total: results.length,
      success: results.filter((item) => item.status === "success").length,
      failed: results.filter((item) => item.status === "error").length
    },
    indexing: indexed
  };
}

async function processFolderJob(job) {
  const user = job.data?.current_user;
  const options = job.data?.folder_options ?? {};
  await job.updateProgress(10);
  const processed = await importDocumentsFromFolder({
    ...options,
    includeText: true
  });
  await job.updateProgress(70);
  const indexed = await ingestProcessedDocuments(processed, user);
  await job.updateProgress(100);
  return {
    type: "folder",
    processing: {
      import_root: processed.import_root,
      folder_path: processed.folder_path,
      recursive: processed.recursive,
      summary: processed.summary
    },
    indexing: indexed
  };
}

const worker = new Worker(
  env.queueRagIngestionName,
  async (job) => {
    logger.info("rag_ingestion_job_started", {
      job_id: job.id,
      name: job.name,
      attempts_made: job.attemptsMade
    });

    if (job.data?.type === "upload") {
      return processUploadJob(job);
    }

    if (job.data?.type === "folder") {
      return processFolderJob(job);
    }

    throw new Error(`Unsupported job type: ${String(job.data?.type ?? "")}`);
  },
  {
    connection: redisConnection,
    concurrency: Math.max(env.queueRagIngestionConcurrency, 1)
  }
);

worker.on("completed", (job) => {
  logger.info("rag_ingestion_job_completed", {
    job_id: job?.id
  });
});

worker.on("failed", (job, error) => {
  logger.error("rag_ingestion_job_failed", {
    job_id: job?.id,
    attempts_made: job?.attemptsMade,
    message: error?.message || "unknown_error"
  });
});

logger.info("rag_ingestion_worker_started", {
  queue: env.queueRagIngestionName,
  concurrency: env.queueRagIngestionConcurrency
});
