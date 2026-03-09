import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import { encryptText } from "../services/crypto.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, "../data/users.json");

router.post("/", async (req, res) => {

  try {

    const { email, password, store_url, consumer_key, consumer_secret } = req.body;

    if (!email || !password || !store_url || !consumer_key || !consumer_secret) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    const raw = fs.readFileSync(USERS_FILE, "utf-8");
    const users = raw ? JSON.parse(raw) : [];

    const exists = users.find(u => u.email === email);

    if (exists) {
      return res.status(400).json({ error: "El usuario ya existe" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
  id: Date.now().toString(),
  email,
  password: hashedPassword,
  store_url,
  consumer_key: encryptText(consumer_key),
  consumer_secret: encryptText(consumer_secret),
};
    users.push(newUser);

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

    res.json({ ok: true });

  } catch (error) {

    res.status(500).json({ error: error.message });

  }

});

export default router;