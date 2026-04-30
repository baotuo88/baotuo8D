import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { authRateLimit } from "../middleware/securityMiddleware.js";
import { getCurrentUser, loginUser, registerUser } from "../services/authService.js";

const router = Router();

router.post("/auth/register", authRateLimit, async (req, res, next) => {
  try {
    const result = await registerUser(req.body ?? {});
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/login", authRateLimit, async (req, res, next) => {
  try {
    const result = await loginUser(req.body ?? {});
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.get("/auth/me", requireAuth, async (req, res, next) => {
  try {
    const user = await getCurrentUser(req.user.id);
    res.json({ data: user });
  } catch (error) {
    next(error);
  }
});

export default router;
