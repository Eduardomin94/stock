import express from "express";
import jwt from "jsonwebtoken";
import { findUserById } from "../services/users.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({
        error: "Falta token",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.AUTH_JWT_SECRET || "dev_secret_change_this"
    );

    const user = await findUserById(decoded.id);

    if (!user) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    return res.json({
      id: user.id,
      email: user.email,
      store_url: user.store_url || "",
      usa_precio_efectivo: user.email === "cielropa@gmail.com",
    });
  } catch (error) {
    return res.status(401).json({
      error: "Token inválido o vencido",
    });
  }
});

export default router;