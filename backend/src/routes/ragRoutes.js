import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { ROLES } from "../constants/roles.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRoles } from "../middleware/rbacMiddleware.js";
import {
  processSingleDocument
} from "../services/documentProcessingService.js";
import { generateEightDFromRag, generateEightDFromRagAB } from "../services/ragGenerationService.js";
import { createRagIngestionJob, getRagIngestionJobStatus } from "../services/ragIngestionJobService.js";
import { queryAiGenerationLogs } from "../services/aiLogService.js";
import {
  getRagEvaluationStats,
  upsertRagGenerationEvaluation
} from "../services/ragEvaluationService.js";
import { searchRagCases } from "../services/ragSearchService.js";
import {
  getWritingStyleProfile,
  learnWritingStyle,
  learnWritingStyleFromProcessedDocuments,
  listStyleProfiles
} from "../services/writingStyleService.js";

fs.mkdirSync(env.documentUploadDir, { recursive: true });

function sanitizeFileName(fileName) {
  const base = path.basename(fileName || "file");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.documentUploadDir),
  filename: (_req, file, cb) => {
    const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniquePrefix}-${sanitizeFileName(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    files: Math.max(env.documentMaxUploadFiles, 1),
    fileSize: env.documentMaxUploadFileSizeMB * 1024 * 1024
  }
});

const router = Router();

router.use(requireAuth);

async function safeUnlink(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fsPromises.unlink(filePath);
  } catch (_error) {
    // best effort cleanup
  }
}

router.post("/rag/search", async (req, res, next) => {
  try {
    const data = await searchRagCases(req.body ?? {}, req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/rag/generate", async (req, res, next) => {
  try {
    const data = await generateEightDFromRag(req.body ?? {}, req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/rag/generate/ab", async (req, res, next) => {
  try {
    const data = await generateEightDFromRagAB(req.body ?? {}, req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/rag/cases/upload",
  requireRoles([ROLES.ADMIN]),
  upload.array("files", Math.max(env.documentMaxUploadFiles, 1)),
  async (req, res, next) => {
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      const data = await createRagIngestionJob({
        type: "upload",
        files: files.map((file) => ({
          path: file.path,
          originalname: file.originalname || file.filename
        })),
        current_user: req.user
      });

      res.status(201).json({
        data
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post("/rag/style-profiles", requireRoles([ROLES.ADMIN]), async (req, res, next) => {
  try {
    const data = await learnWritingStyle(req.body ?? {}, req.user);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/rag/style-profiles/upload",
  requireRoles([ROLES.ADMIN]),
  upload.array("files", Math.max(env.documentMaxUploadFiles, 1)),
  async (req, res, next) => {
    try {
      const payload = req.body ?? {};
      const files = Array.isArray(req.files) ? req.files : [];
      const processedResults = [];

      for (const file of files) {
        try {
          const processed = await processSingleDocument({
            source: "style-upload",
            filePath: file.path,
            fileName: file.originalname || file.filename,
            includeText: true
          });
          processedResults.push(processed);
        } catch (error) {
          processedResults.push({
            source: "style-upload",
            file_name: file.originalname || file.filename,
            file_path: file.path,
            status: "error",
            error: error.message || "Document processing failed"
          });
        }
      }

      const data = await learnWritingStyleFromProcessedDocuments(
        payload,
        processedResults,
        req.user
      );

      res.status(201).json({
        data: {
          profile: data,
          processed: {
            total: processedResults.length,
            success: processedResults.filter((item) => item.status === "success").length,
            failed: processedResults.filter((item) => item.status === "error").length
          }
        }
      });
    } catch (error) {
      next(error);
    } finally {
      const files = Array.isArray(req.files) ? req.files : [];
      await Promise.all(files.map((file) => safeUnlink(file.path)));
    }
  }
);

router.get("/rag/style-profiles", async (req, res, next) => {
  try {
    const data = await listStyleProfiles(req.query ?? {}, req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get("/rag/style-profiles/latest", async (req, res, next) => {
  try {
    const data = await getWritingStyleProfile("", req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get("/rag/style-profiles/:profileId", async (req, res, next) => {
  try {
    const data = await getWritingStyleProfile(req.params.profileId, req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/rag/cases/import-folder", requireRoles([ROLES.ADMIN]), async (req, res, next) => {
  try {
    const data = await createRagIngestionJob({
      type: "folder",
      folder_options: req.body ?? {},
      current_user: req.user
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get("/rag/jobs/:jobId", requireRoles([ROLES.ADMIN]), async (req, res, next) => {
  try {
    const data = await getRagIngestionJobStatus(req.params.jobId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get("/rag/logs", async (req, res, next) => {
  try {
    const data = await queryAiGenerationLogs(req.query ?? {}, req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.post("/rag/evaluations", async (req, res, next) => {
  try {
    const data = await upsertRagGenerationEvaluation(req.body ?? {}, req.user);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

router.get("/rag/evaluations/stats", async (req, res, next) => {
  try {
    const data = await getRagEvaluationStats(req.query ?? {}, req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

export default router;
