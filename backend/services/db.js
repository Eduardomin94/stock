import pkg from "pg";

const { Pool } = pkg;

const databaseUrl = process.env.DATABASE_URL || "";

const isLocalDb =
  databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

export const hasDatabase = Boolean(databaseUrl);

export const pool = hasDatabase
  ? new Pool({
      connectionString: databaseUrl,
      ssl: isLocalDb ? false : { rejectUnauthorized: false },
    })
  : null;

export async function query(text, params = []) {
  if (!pool) {
    throw new Error("Base de datos no configurada");
  }

  return pool.query(text, params);
}

export async function ensureDatabase() {
  if (!pool) return;

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      store_url TEXT,
      consumer_key TEXT,
      consumer_secret TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}