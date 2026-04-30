import { Router } from "express";
import { ROLES } from "../constants/roles.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRoles } from "../middleware/rbacMiddleware.js";
import {
  getCurrentPromptTemplate,
  updateCurrentPromptTemplate
} from "../services/promptTemplateService.js";

const router = Router();

router.use(requireAuth);

router.get("/prompts/current", async (req, res, next) => {
  try {
    const data = await getCurrentPromptTemplate({ scene: req.query?.scene }, req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.put("/prompts/current", requireRoles([ROLES.ADMIN]), async (req, res, next) => {
  try {
    const data = await updateCurrentPromptTemplate(req.body ?? {}, req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

export default router;
