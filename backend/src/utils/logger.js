import { env } from "../config/env.js";

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function shouldLog(level) {
  const current = LEVELS[env.logLevel] ?? LEVELS.info;
  return (LEVELS[level] ?? LEVELS.info) >= current;
}

function serialize(level, event, data = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: env.serviceName,
    ...data
  };

  if (env.logPretty) {
    return `[${payload.timestamp}] ${level.toUpperCase()} ${event} ${JSON.stringify(data)}`;
  }

  return JSON.stringify(payload);
}

function write(level, event, data = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const line = serialize(level, event, data);

  if (level === "error") {
    process.stderr.write(`${line}\n`);
    return;
  }

  process.stdout.write(`${line}\n`);
}

export const logger = {
  debug(event, data) {
    write("debug", event, data);
  },
  info(event, data) {
    write("info", event, data);
  },
  warn(event, data) {
    write("warn", event, data);
  },
  error(event, data) {
    write("error", event, data);
  }
};
