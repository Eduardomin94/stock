import express from "express";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { requireAdmin } from "../middleware/requireAdmin.js";
import architectPromptModule from "../architectPrompt.js";
const { AGENT_ARCHITECT_PROMPT } = architectPromptModule;

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "../data/agents.json");

router.post("/", requireAdmin, async (req, res) => {
  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { request } = req.body;

    if (!request || typeof request !== "string") {
      return res.status(400).json({
        error: "Falta 'request' en el body",
      });
    }

    const response = await client.responses.create({
      model: "gpt-5",
      input: [
        {
          role: "system",
          content: AGENT_ARCHITECT_PROMPT,
        },
        {
          role: "user",
          content: request,
        },
      ],
    });

    const text = response.output_text || "";

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "El modelo no devolvió JSON válido",
        raw: text,
      });
    }

    let agents = [];

    if (fs.existsSync(DATA_FILE)) {
      const rawFile = fs.readFileSync(DATA_FILE, "utf-8");
      agents = rawFile ? JSON.parse(rawFile) : [];
    }

    const newAgent = {
      id: Date.now().toString(),
      created_at: new Date().toISOString(),
      ...parsed,
    };

    agents.push(newAgent);

    fs.writeFileSync(DATA_FILE, JSON.stringify(agents, null, 2), "utf-8");

    res.json(newAgent);
  } catch (error) {
    console.error("Error en /create-agent:", error);
    res.status(500).json({
      error: "Error interno al crear el agente",
      detail: error.message,
    });
  }
});

export default router;