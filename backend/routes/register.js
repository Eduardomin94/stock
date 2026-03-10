import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import { encryptText } from "../services/crypto.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, "../data/users.json");

router.post("/", requireAdmin, async (req, res) => {
  try {
    const { email, password, store_url, consumer_key, consumer_secret } = req.body;

    let normalizedStoreUrl = String(store_url || "").trim();

if (normalizedStoreUrl.endsWith("/")) {
  normalizedStoreUrl = normalizedStoreUrl.slice(0, -1);
}

if (!normalizedStoreUrl.includes("/wp-json/wc")) {
  normalizedStoreUrl = normalizedStoreUrl + "/wp-json/wc/v3";
}

    if (!email || !password || !normalizedStoreUrl || !consumer_key || !consumer_secret) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, "[]", "utf-8");
    }

    const raw = fs.readFileSync(USERS_FILE, "utf-8");
    const users = raw ? JSON.parse(raw) : [];

    const exists = users.find(
      (u) => String(u.email || "").trim().toLowerCase() === String(email).trim().toLowerCase()
    );

    if (exists) {
      return res.status(400).json({ error: "El usuario ya existe" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: Date.now().toString(),
      email: String(email).trim(),
      password: hashedPassword,
      store_url: normalizedStoreUrl,
      consumer_key: encryptText(String(consumer_key).trim()),
      consumer_secret: encryptText(String(consumer_secret).trim()),
      created_at: new Date().toISOString(),
    };

    users.push(newUser);

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");

    res.json({ ok: true, user: { id: newUser.id, email: newUser.email } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;