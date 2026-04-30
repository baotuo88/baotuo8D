import { Router } from "express";
import { ChromaClient } from "chromadb";
import { env } from "../config/env.js";
import { query } from "../db/pool.js";
import { redisConnection } from "../queue/redis.js";

const router = Router();

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Timed out")), timeoutMs);
    })
  ]);
}

router.get("/health", async (_req, res) => {
  try {
    const startedAt = Date.now();
    await withTimeout(query("SELECT 1"), env.healthcheckTimeoutMs);
    await withTimeout(redisConnection.ping(), env.healthcheckTimeoutMs);
    const chroma = new ChromaClient({ path: env.chromaUrl });
    await withTimeout(chroma.heartbeat(), env.healthcheckTimeoutMs);

    res.json({
      status: "ok",
      service: env.serviceName,
      timestamp: new Date().toISOString(),
      checks: {
        database: "ok",
        redis: "ok",
        chroma: "ok"
      },
      response_time_ms: Date.now() - startedAt
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      service: env.serviceName,
      message: error.message,
      checks: {
        database: "error",
        redis: "error",
        chroma: "error"
      }
    });
  }
});

export default router;
