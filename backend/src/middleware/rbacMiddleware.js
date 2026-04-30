import { httpError } from "../utils/httpError.js";

export function requireRoles(roles) {
  return (req, _res, next) => {
    if (!req.user) {
      next(httpError(401, "Authentication required"));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(httpError(403, "Insufficient permissions"));
      return;
    }

    next();
  };
}
