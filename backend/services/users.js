import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { query, hasDatabase } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USERS_FILE = path.join(__dirname, "../data/users.json");

function ensureUsersFile() {
  const dir = path.dirname(USERS_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]", "utf-8");
  }
}

function readUsersFile() {
  ensureUsersFile();
  const raw = fs.readFileSync(USERS_FILE, "utf-8");
  return raw ? JSON.parse(raw) : [];
}

function writeUsersFile(users) {
  ensureUsersFile();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

export async function listUsers() {
  if (hasDatabase) {
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

  const users = readUsersFile();

  return users.sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
}

export async function findUserByEmail(email) {
  const safeEmail = String(email || "").trim();

  if (hasDatabase) {
    const result = await query(
      `SELECT id, email, password, store_url, consumer_key, consumer_secret, created_at
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [safeEmail]
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

  const users = readUsersFile();

  return (
    users.find(
      (user) => String(user.email || "").trim().toLowerCase() === safeEmail.toLowerCase()
    ) || null
  );
}

export async function findUserById(id) {
  const safeId = String(id || "").trim();

  if (hasDatabase) {
    const result = await query(
      `SELECT id, email, password, store_url, consumer_key, consumer_secret, created_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [safeId]
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

  const users = readUsersFile();

  return users.find((user) => String(user.id || "").trim() === safeId) || null;
}

export async function createUser({
  email,
  password,
  store_url = "",
  consumer_key = "",
  consumer_secret = "",
}) {
  const safeEmail = String(email || "").trim();
  const safePassword = String(password || "");
  const safeStoreUrl = String(store_url || "").trim();
  const safeConsumerKey = String(consumer_key || "").trim();
  const safeConsumerSecret = String(consumer_secret || "").trim();

  if (hasDatabase) {
    const id = randomUUID();

    const result = await query(
      `INSERT INTO users (id, email, password, store_url, consumer_key, consumer_secret)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, password, store_url, consumer_key, consumer_secret, created_at`,
      [id, safeEmail, safePassword, safeStoreUrl, safeConsumerKey, safeConsumerSecret]
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

  const users = readUsersFile();

  const exists = users.some(
    (user) => String(user.email || "").trim().toLowerCase() === safeEmail.toLowerCase()
  );

  if (exists) {
    throw new Error("El usuario ya existe");
  }

  const newUser = {
    id: randomUUID(),
    email: safeEmail,
    password: safePassword,
    store_url: safeStoreUrl,
    consumer_key: safeConsumerKey,
    consumer_secret: safeConsumerSecret,
    created_at: new Date().toISOString(),
  };

  users.push(newUser);
  writeUsersFile(users);

  return newUser;
}