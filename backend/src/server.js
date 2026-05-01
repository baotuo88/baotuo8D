import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

if (!env.jwtSecret || env.jwtSecret.length < 32) {
  throw new Error("JWT_SECRET is required and must be at least 32 characters");
}

if (env.nodeEnv === "production" && !env.secretCryptoKey) {
  throw new Error("SECRET_CRYPTO_KEY is required in production");
}

app.listen(env.port, () => {
  logger.info("server_started", {
    service: env.serviceName,
    port: env.port,
    node_env: env.nodeEnv
  });
});
