import { env } from "../config/env.js";
import { httpError } from "./httpError.js";

let cachedSecret = null;

export function resolveJwtSecret() {
  if (cachedSecret) {
    return cachedSecret;
  }

  if (!env.jwtSecret || env.jwtSecret.length < 32) {
    throw httpError(500, "JWT_SECRET is missing or too short (min 32 chars)");
  }

  cachedSecret = env.jwtSecret;
  return cachedSecret;
}
