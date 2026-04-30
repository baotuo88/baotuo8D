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
router.use(requireRoles([ROLES.ADMIN]));

router.get("/ai-config", async (req, res, next) => {
  try {
    const config = await getAiConfigForAdmin(req.user);
    res.json({ data: config });
  } catch (error) {
    next(error);
  }
});

router.put("/ai-config", async (req, res, next) => {
  try {
    const config = await updateAiConfig(req.body ?? {}, req.user);
    res.json({ data: config });
  } catch (error) {
    next(error);
  }
});

router.get("/ai-config/providers", async (req, res, next) => {
  try {
    const data = await listAiProviderConfigs(req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.put("/ai-config/providers", async (req, res, next) => {
  try {
    const data = await upsertAiProviderConfig(req.body ?? {}, req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

export default router;
