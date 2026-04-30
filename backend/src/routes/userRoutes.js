import { Router } from "express";
import { ROLES } from "../constants/roles.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRoles } from "../middleware/rbacMiddleware.js";
import { getUsers } from "../services/authService.js";

const router = Router();

router.get(
  "/users",
  requireAuth,
  requireRoles([ROLES.ADMIN]),
  async (req, res, next) => {
    try {
      const limit = Number.parseInt(req.query.limit, 10) || 50;
      const users = await getUsers(Math.min(limit, 200));
      res.json({ data: users });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
