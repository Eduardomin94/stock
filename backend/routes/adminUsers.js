import express from "express";
import bcrypt from "bcrypt";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  listUsers,
  findUserById,
  updateUserPasswordById,
} from "../services/users.js";

const router = express.Router();

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const users = await listUsers();

    return res.json({
      ok: true,
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        created_at: user.created_at || null,
        is_admin: String(user.email || "").trim().toLowerCase() === String(process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
      })),
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "No se pudieron listar los usuarios",
    });
  }
});

router.patch("/:id/password", requireAdmin, async (req, res) => {
  try {
    const userId = String(req.params.id || "").trim();
    const newPassword = String(req.body?.password || "");

    if (!userId || !newPassword) {
      return res.status(400).json({
        error: "Faltan id o password",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: "La nueva contraseña debe tener al menos 6 caracteres",
      });
    }

    const existingUser = await findUserById(userId);

    if (!existingUser) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updatedUser = await updateUserPasswordById(userId, hashedPassword);

    if (!updatedUser) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    return res.json({
      ok: true,
      message: `Contraseña actualizada correctamente para ${updatedUser.email}`,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "No se pudo actualizar la contraseña",
    });
  }
});

export default router;
