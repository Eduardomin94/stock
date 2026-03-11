import { randomUUID } from "crypto";
import { query } from "./db.js";

export async function listUsers() {
  const result = await query(
    `SELECT id, email, password, store_url, consumer_key, consumer_secret, created_at
     FROM users
     ORDER BY created_at DESC`
  );

  return result.rows.map((row) => ({
    id: row.id,
    email: row.email,
    password: row.password,
    store_url: row.store_url || "",
    consumer_key: row.consumer_key || "",
    consumer_secret: row.consumer_secret || "",
    created_at: row.created_at,
  }));
}

export async function findUserByEmail(email) {
  const result = await query(
    `SELECT id, email, password, store_url, consumer_key, consumer_secret, created_at
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [String(email || "").trim()]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    password: row.password,
    store_url: row.store_url || "",
    consumer_key: row.consumer_key || "",
    consumer_secret: row.consumer_secret || "",
    created_at: row.created_at,
  };
}

export async function findUserById(id) {
  const result = await query(
    `SELECT id, email, password, store_url, consumer_key, consumer_secret, created_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [String(id || "").trim()]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    password: row.password,
    store_url: row.store_url || "",
    consumer_key: row.consumer_key || "",
    consumer_secret: row.consumer_secret || "",
    created_at: row.created_at,
  };
}

export async function createUser({
  email,
  password,
  store_url = "",
  consumer_key = "",
  consumer_secret = "",
}) {
  const id = randomUUID();

  const result = await query(
    `INSERT INTO users (id, email, password, store_url, consumer_key, consumer_secret)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, password, store_url, consumer_key, consumer_secret, created_at`,
    [
      id,
      String(email || "").trim(),
      String(password || ""),
      String(store_url || "").trim(),
      String(consumer_key || "").trim(),
      String(consumer_secret || "").trim(),
    ]
  );

  const row = result.rows[0];

  return {
    id: row.id,
    email: row.email,
    password: row.password,
    store_url: row.store_url || "",
    consumer_key: row.consumer_key || "",
    consumer_secret: row.consumer_secret || "",
    created_at: row.created_at,
  };
}