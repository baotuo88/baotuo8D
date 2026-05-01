import crypto from "crypto";
import { env } from "../config/env.js";

function resolveKey() {
  const keyText = env.secretCryptoKey || env.jwtSecret || "";
  if (!keyText) {
    throw new Error("SECRET_CRYPTO_KEY or JWT_SECRET is required for secret encryption");
  }

  return crypto.createHash("sha256").update(keyText).digest();
}

export function encryptSecret(plainText) {
  const text = String(plainText ?? "").trim();
  if (!text) {
    return "";
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", resolveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }

  if (!text.startsWith("enc:v1:")) {
    return text;
  }

  const parts = text.split(":");
  if (parts.length !== 5) {
    throw new Error("Invalid encrypted secret format");
  }

  const iv = Buffer.from(parts[2], "base64");
  const tag = Buffer.from(parts[3], "base64");
  const payload = Buffer.from(parts[4], "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", resolveKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString("utf8");
}

export function isEncryptedSecret(value) {
  return String(value ?? "").trim().startsWith("enc:v1:");
}
