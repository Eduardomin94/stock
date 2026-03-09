import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "../data/agents.json");

router.get("/", (_req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.json([]);
    }

    const rawFile = fs.readFileSync(DATA_FILE, "utf-8");
    const agents = rawFile ? JSON.parse(rawFile) : [];

    res.json(agents);
  } catch (error) {
    console.error("Error en /agents:", error);
    res.status(500).json({
      error: "Error al leer los agentes",
      detail: error.message,
    });
  }
});

export default router;