import { Router } from "express";
import { ROLES } from "../constants/roles.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRoles } from "../middleware/rbacMiddleware.js";
import {
  getAiConfigForAdmin,
  listAiProviderConfigs,
  updateAiConfig,
  upsertAiProviderConfig
} from "../services/aiConfigService.js";

const router = Router();

router.use(requireAuth);

router.get("/ai-config", requireRoles([ROLES.ADMIN]), async (req, res, next) => {
  try {
    const config = await getAiConfigForAdmin(req.user);
    res.json({ data: config });
  } catch (error) {
    next(error);
  }
});

router.put("/ai-config", requireRoles([ROLES.ADMIN]), async (req, res, next) => {
  try {
    const config = await updateAiConfig(req.body ?? {}, req.user);
    res.json({ data: config });
  } catch (error) {
    next(error);
  }
});

router.get("/ai-config/providers", requireRoles([ROLES.ADMIN]), async (req, res, next) => {
  try {
    const data = await listAiProviderConfigs(req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.put("/ai-config/providers", requireRoles([ROLES.ADMIN]), async (req, res, next) => {
  try {
    const data = await upsertAiProviderConfig(req.body ?? {}, req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

export default router;
