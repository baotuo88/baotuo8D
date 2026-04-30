import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.databaseUrl
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL error", error);
});

export async function query(text, params = []) {
  return pool.query(text, params);
}
