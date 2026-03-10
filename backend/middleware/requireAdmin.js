import jwt from "jsonwebtoken";

export function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({
        error: "No autorizado",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.AUTH_JWT_SECRET || "dev_secret_change_this"
    );

    const adminEmail = String(process.env.ADMIN_EMAIL || "")
      .trim()
      .toLowerCase();

    const requesterEmail = String(decoded?.email || "")
      .trim()
      .toLowerCase();

    if (!adminEmail || requesterEmail !== adminEmail) {
      return res.status(403).json({
        error: "Solo el administrador puede hacer esto",
      });
    }

    req.adminUser = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: "Token inválido o vencido",
    });
  }
}