import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { ROLES } from "../constants/roles.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRoles } from "../middleware/rbacMiddleware.js";
import {
  importDocumentsFromFolder,
  processUploadedDocuments
} from "../services/documentProcessingService.js";

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

router.post(
  "/upload",
  requireAuth,
  upload.array("files", Math.max(env.documentMaxUploadFiles, 1)),
  async (req, res, next) => {
    try {
      const includeText = req.body?.includeText;
      const data = await processUploadedDocuments(req.files ?? [], {
        includeText
      });
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/import-folder",
  requireAuth,
  requireRoles([ROLES.ADMIN]),
  async (req, res, next) => {
    try {
      const data = await importDocumentsFromFolder(req.body ?? {});
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
