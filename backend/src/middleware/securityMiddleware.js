import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "../config/env.js";
import { httpError } from "../utils/httpError.js";

export function assertProductionCorsSafety() {
  if (env.nodeEnv !== "production") {
    return;
  }

  if (String(env.corsOrigin).trim() === "*") {
    throw new Error("CORS_ORIGIN must not be '*' in production");
  }
}

export function createHelmetMiddleware() {
  if (!env.securityEnableHelmet) {
    return (_req, _res, next) => next();
  }

  return helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  });
}

function createRateLimitHandler(message) {
  return (_req, _res, next, options) => {
    next(httpError(options.statusCode, message));
  };
}

export const globalRateLimit = rateLimit({
  windowMs: Math.max(env.securityGlobalRateWindowMs, 1000),
  limit: Math.max(env.securityGlobalRateMax, 10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: createRateLimitHandler("Too many requests, please retry later")
});

export const authRateLimit = rateLimit({
  windowMs: Math.max(env.securityAuthRateWindowMs, 1000),
  limit: Math.max(env.securityAuthRateMax, 3),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: createRateLimitHandler("Too many auth attempts, please retry later")
});
