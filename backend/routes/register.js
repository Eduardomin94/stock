import express from "express";
import bcrypt from "bcrypt";
import { encryptText } from "../services/crypto.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { findUserByEmail, createUser } from "../services/users.js";

const router = express.Router();

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

    const exists = await findUserByEmail(email);

    if (exists) {
      return res.status(400).json({ error: "El usuario ya existe" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await createUser({
      email: String(email).trim(),
      password: hashedPassword,
      store_url: normalizedStoreUrl,
      consumer_key: encryptText(String(consumer_key).trim()),
      consumer_secret: encryptText(String(consumer_secret).trim()),
    });

    res.json({
      ok: true,
      user: {
        id: newUser.id,
        email: newUser.email,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;