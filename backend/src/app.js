import cors from "cors";
import express from "express";
import aiConfigRoutes from "./routes/aiConfigRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import eightDReportRoutes from "./routes/eightDReportRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import promptTemplateRoutes from "./routes/promptTemplateRoutes.js";
import ragRoutes from "./routes/ragRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { env } from "./config/env.js";
import {
  assertProductionCorsSafety,
  createHelmetMiddleware,
  globalRateLimit
} from "./middleware/securityMiddleware.js";
import { logger } from "./utils/logger.js";
import { recordRequest, renderPrometheusMetrics } from "./utils/metrics.js";

const app = express();

assertProductionCorsSafety();

app.use(
  cors({
    origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(",").map((item) => item.trim()),
    credentials: true
  })
);
app.use(createHelmetMiddleware());
app.use(globalRateLimit);
app.use(express.json({ limit: "20mb" }));

app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    logger.info("http_request", {
      method: req.method,
      path: req.originalUrl,
      status_code: res.statusCode,
      duration_ms: durationMs,
      ip: req.ip
    });
    recordRequest({
      method: req.method,
      path: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path,
      statusCode: res.statusCode,
      durationMs
    });
  });

  next();
});

app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use("/api", userRoutes);
app.use("/api", aiConfigRoutes);
app.use("/api", promptTemplateRoutes);
app.use("/api", documentRoutes);
app.use("/api", reportRoutes);
app.use("/api", eightDReportRoutes);
app.use("/api", ragRoutes);

function normalizeClientIp(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

app.get("/metrics", (req, res) => {
  const allowedIps = Array.isArray(env.metricsAllowedIps) ? env.metricsAllowedIps : [];
  if (allowedIps.length > 0) {
    const ip = normalizeClientIp(req.ip);
    if (!allowedIps.includes(ip)) {
      res.status(403).json({ message: "Forbidden metrics source" });
      return;
    }
  }

  if (env.metricsToken) {
    const authHeader = String(req.headers.authorization ?? "");
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const headerToken = String(req.headers["x-metrics-token"] ?? "").trim();
    const provided = bearer || headerToken;

    if (!provided || provided !== env.metricsToken) {
      res.status(401).json({ message: "Unauthorized metrics access" });
      return;
    }
  }

  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(renderPrometheusMetrics());
});

function resolveUploadErrorMessage(error) {
  if (!error?.code) {
    return null;
  }

  if (error.code === "LIMIT_FILE_SIZE") {
    return "Uploaded file is too large";
  }

  if (error.code === "LIMIT_FILE_COUNT") {
    return "Too many files uploaded";
  }

  if (error.code === "LIMIT_UNEXPECTED_FILE") {
    return "Unexpected file field. Use form-data field name 'files'";
  }

  return null;
}

app.use((error, _req, res, _next) => {
  logger.error("request_error", {
    message: error.message,
    stack: error.stack,
    code: error.code,
    name: error.name,
    status: error.status
  });

  const uploadErrorMessage = error?.name === "MulterError" ? resolveUploadErrorMessage(error) : null;

  const status = Number.isInteger(error.status)
    ? error.status
    : error?.name === "MulterError"
      ? 400
      : 500;

  res.status(status).json({
    message: uploadErrorMessage || error.message || "Internal server error"
  });
});

export default app;
