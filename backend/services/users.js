import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, "../data/users.json");

export function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];

  const raw = fs.readFileSync(USERS_FILE, "utf-8");
  return raw ? JSON.parse(raw) : [];
}

export function findUserById(userId) {
  const users = loadUsers();
  return users.find((user) => user.id === userId) || null;
}