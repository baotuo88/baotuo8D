import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  approveEightDReport,
  createEightDReport,
  getEightDReportById,
  listEightDReportApprovals,
  listEightDReportStatusHistory,
  listEightDReports,
  transitionEightDReportStatus,
  updateEightDReportStep,
  updateEightDReportTitle
} from "../services/eightDReportService.js";

const router = Router();

router.use(requireAuth);

router.post("/8d-reports", async (req, res, next) => {
  try {
    const report = await createEightDReport(req.body ?? {}, req.user);
    res.status(201).json({ data: report });
  } catch (error) {
    next(error);
  }
});

router.get("/8d-reports", async (req, res, next) => {
  try {
    const reports = await listEightDReports(
      {
        limit: req.query.limit,
        status: req.query.status
      },
      req.user
    );

    res.json({ data: reports });
  } catch (error) {
    next(error);
  }
});

router.get("/8d-reports/:reportId", async (req, res, next) => {
  try {
    const report = await getEightDReportById(req.params.reportId, req.user);
    res.json({ data: report });
  } catch (error) {
    next(error);
  }
});

router.patch("/8d-reports/:reportId", async (req, res, next) => {
  try {
    const report = await updateEightDReportTitle(req.params.reportId, req.body ?? {}, req.user);
    res.json({ data: report });
  } catch (error) {
    next(error);
  }
});

router.patch("/8d-reports/:reportId/steps/:step", async (req, res, next) => {
  try {
    const report = await updateEightDReportStep(
      req.params.reportId,
      req.params.step,
      req.body ?? {},
      req.user
    );

    res.json({ data: report });
  } catch (error) {
    next(error);
  }
});

router.patch("/8d-reports/:reportId/status", async (req, res, next) => {
  try {
    const report = await transitionEightDReportStatus(req.params.reportId, req.body ?? {}, req.user);
    res.json({ data: report });
  } catch (error) {
    next(error);
  }
});

router.post("/8d-reports/:reportId/approvals", async (req, res, next) => {
  try {
    const report = await approveEightDReport(req.params.reportId, req.body ?? {}, req.user);
    res.json({ data: report });
  } catch (error) {
    next(error);
  }
});

router.get("/8d-reports/:reportId/approvals", async (req, res, next) => {
  try {
    const approvals = await listEightDReportApprovals(req.params.reportId, req.user);
    res.json({ data: approvals });
  } catch (error) {
    next(error);
  }
});

router.get("/8d-reports/:reportId/status-history", async (req, res, next) => {
  try {
    const history = await listEightDReportStatusHistory(req.params.reportId, req.user);
    res.json({ data: history });
  } catch (error) {
    next(error);
  }
});

export default router;
