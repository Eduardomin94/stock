import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, "../data/users.json");

router.post("/", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Faltan email o password",
      });
    }

    if (!fs.existsSync(USERS_FILE)) {
      return res.status(404).json({
        error: "No existe el archivo de usuarios",
      });
    }

    const raw = fs.readFileSync(USERS_FILE, "utf-8");

    let parsed;
    try {
      parsed = raw ? JSON.parse(raw) : [];
    } catch {
      return res.status(500).json({
        error: "users.json no tiene JSON válido",
      });
    }

    const users = Array.isArray(parsed) ? parsed : [];

    const user = users.find(
      (u) => String(u.email || "").trim().toLowerCase() === String(email).trim().toLowerCase()
    );

    if (!user) {
      return res.status(401).json({
        error: "Credenciales inválidas",
      });
    }

    const passwordOk = await bcrypt.compare(password, user.password);

    if (!passwordOk) {
      return res.status(401).json({
        error: "Credenciales inválidas",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
      },
      process.env.AUTH_JWT_SECRET || "dev_secret_change_this",
      {
        expiresIn: "7d",
      }
    );

    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Error interno en login",
    });
  }
});

export default router;