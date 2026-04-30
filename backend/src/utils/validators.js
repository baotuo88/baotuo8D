import { httpError } from "./httpError.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function validateEmail(email) {
  if (!EMAIL_REGEX.test(email)) {
    throw httpError(400, "Invalid email format");
  }
}

export function validateName(name) {
  const trimmed = String(name ?? "").trim();

  if (trimmed.length < 2 || trimmed.length > 64) {
    throw httpError(400, "name must be between 2 and 64 characters");
  }

  return trimmed;
}

export function validatePassword(password) {
  const value = String(password ?? "");

  if (value.length < 8 || value.length > 72) {
    throw httpError(400, "password must be between 8 and 72 characters");
  }

  return value;
}
