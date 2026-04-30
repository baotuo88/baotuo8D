import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { httpError } from "../utils/httpError.js";

function resolveJwtSecret() {
  if (!env.jwtSecret || env.jwtSecret.length < 32) {
    throw httpError(500, "JWT_SECRET is missing or too short (min 32 chars)");
  }

  return env.jwtSecret;
}

export function requireAuth(req, _res, next) {
  try {
    const authHeader = req.headers.authorization ?? "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw httpError(401, "Missing or invalid Authorization header");
    }

    const decoded = jwt.verify(token, resolveJwtSecret(), {
      algorithms: ["HS256"]
    });

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name
    };

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      next(httpError(401, "Invalid or expired token"));
      return;
    }

    next(error);
  }
}
