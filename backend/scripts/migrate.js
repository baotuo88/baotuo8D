import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../src/db/pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationDir = path.resolve(__dirname, "../sql/migrations");

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function checksum(content) {
  let hash = 0;
  for (let i = 0; i < content.length; i += 1) {
    hash = (hash * 31 + content.charCodeAt(i)) >>> 0;
  }
  return String(hash);
}

async function loadMigrations() {
  const entries = await fs.readdir(migrationDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  const migrations = [];
  for (const filename of files) {
    const fullPath = path.join(migrationDir, filename);
    const sql = await fs.readFile(fullPath, "utf8");
    migrations.push({ filename, sql, checksum: checksum(sql) });
  }

  return migrations;
}

async function run() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const appliedResult = await client.query(
      "SELECT filename, checksum FROM schema_migrations ORDER BY filename ASC"
    );
    const appliedMap = new Map(appliedResult.rows.map((row) => [row.filename, row.checksum]));

    const migrations = await loadMigrations();

    for (const migration of migrations) {
      const existingChecksum = appliedMap.get(migration.filename);

      if (existingChecksum) {
        if (existingChecksum !== migration.checksum) {
          throw new Error(
            `Migration checksum mismatch: ${migration.filename}. Expected ${existingChecksum}, got ${migration.checksum}`
          );
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
          [migration.filename, migration.checksum]
        );
        await client.query("COMMIT");
        console.log(`[migrate] applied ${migration.filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("[migrate] done");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(`[migrate] failed: ${error.message}`);
  process.exit(1);
});
