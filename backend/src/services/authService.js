import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ROLES, VALID_ROLES } from "../constants/roles.js";
import { httpError } from "../utils/httpError.js";
import { resolveJwtSecret } from "../utils/jwtHelper.js";
import {
  normalizeEmail,
  validateEmail,
  validateName,
  validatePassword
} from "../utils/validators.js";
import {
  createUserRecord,
  findUserByEmail,
  findUserById,
  listAllUsers
} from "./userService.js";

function getSaltRounds() {
  return Math.max(8, Math.min(env.bcryptSaltRounds, 14));
}

function issueToken(user) {
  const secret = resolveJwtSecret();

  return jwt.sign(
    {
      email: user.email,
      role: user.role,
      name: user.name
    },
    secret,
    {
      subject: user.id,
      expiresIn: env.jwtExpiresIn,
      algorithm: "HS256"
    }
  );
}

function resolveRole(inputRole) {
  const role = String(inputRole ?? ROLES.USER).trim().toLowerCase();

  if (!VALID_ROLES.has(role)) {
    throw httpError(400, "Invalid role");
  }

  return role;
}

function normalizeRegisterPayload(payload) {
  const email = normalizeEmail(payload.email);
  const name = validateName(payload.name);
  const password = validatePassword(payload.password);
  validateEmail(email);

  return {
    name,
    email,
    password,
    role: resolveRole(payload.role),
    adminRegisterToken: String(payload.adminRegisterToken ?? "")
  };
}

export async function registerUser(payload) {
  const input = normalizeRegisterPayload(payload ?? {});

  if (input.role === ROLES.ADMIN) {
    if (!env.adminRegisterToken) {
      throw httpError(403, "Admin registration is disabled");
    }

    const providedToken = Buffer.from(input.adminRegisterToken, "utf8");
    const expectedToken = Buffer.from(env.adminRegisterToken, "utf8");

    if (providedToken.length !== expectedToken.length || !crypto.timingSafeEqual(providedToken, expectedToken)) {
      throw httpError(403, "Invalid admin registration token");
    }
  }

  const existing = await findUserByEmail(input.email);

  if (existing) {
    throw httpError(409, "Email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, getSaltRounds());
  const user = await createUserRecord({
    name: input.name,
    email: input.email,
    passwordHash,
    role: input.role
  });

  return {
    user,
    token: issueToken(user)
  };
}

export async function loginUser(payload) {
  const email = normalizeEmail(payload?.email);
  const password = String(payload?.password ?? "");

  if (!email || !password) {
    throw httpError(400, "email and password are required");
  }

  validateEmail(email);

  const existing = await findUserByEmail(email);

  if (!existing) {
    throw httpError(401, "Invalid credentials");
  }

  if (!existing.is_active) {
    throw httpError(403, "User is inactive");
  }

  const matched = await bcrypt.compare(password, existing.password_hash);

  if (!matched) {
    throw httpError(401, "Invalid credentials");
  }

  const user = {
    id: existing.id,
    name: existing.name,
    email: existing.email,
    role: existing.role,
    isActive: existing.is_active,
    createdAt: existing.created_at
  };

  return {
    user,
    token: issueToken(user)
  };
}

export async function getCurrentUser(userId) {
  const user = await findUserById(userId);

  if (!user) {
    throw httpError(404, "User not found");
  }

  return user;
}

export async function getUsers(limit = 100) {
  return listAllUsers(limit);
}
