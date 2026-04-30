import { query } from "../db/pool.js";

function toSafeUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at
  };
}

export async function findUserByEmail(email) {
  const result = await query(
    `
    SELECT id, name, email, password_hash, role, is_active, created_at
    FROM users
    WHERE email = $1
    LIMIT 1
    `,
    [email]
  );

  return result.rows[0] ?? null;
}

export async function findUserById(userId) {
  const result = await query(
    `
    SELECT id, name, email, role, is_active, created_at
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );

  return toSafeUser(result.rows[0] ?? null);
}

export async function createUserRecord({ name, email, passwordHash, role }) {
  const result = await query(
    `
    INSERT INTO users (name, email, password_hash, role)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, email, role, is_active, created_at
    `,
    [name, email, passwordHash, role]
  );

  return toSafeUser(result.rows[0]);
}

export async function listAllUsers(limit = 100) {
  const result = await query(
    `
    SELECT id, name, email, role, is_active, created_at
    FROM users
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows.map(toSafeUser);
}
