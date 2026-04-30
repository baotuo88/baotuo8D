import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { createReport, listReports, semanticSearch } from "../services/reportService.js";

const router = Router();

router.use(requireAuth);

router.get("/reports", async (req, res, next) => {
  try {
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    const reports = await listReports(Math.min(limit, 100), req.user);
    res.json({ data: reports });
  } catch (error) {
    next(error);
  }
});

router.post("/reports", async (req, res, next) => {
  try {
    const report = await createReport(req.body ?? {}, req.user);
    res.status(201).json({ data: report });
  } catch (error) {
    next(error);
  }
});

router.post("/reports/search", async (req, res, next) => {
  try {
    const text = String(req.body?.query ?? "");
    const limit = Number.parseInt(req.body?.limit, 10) || 5;
    const matches = await semanticSearch(text, Math.min(limit, 20), req.user);
    res.json({ data: matches });
  } catch (error) {
    next(error);
  }
});

export default router;
