import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import jwt from "jsonwebtoken";
import { createJob, getJobByIdForUser, listJobsByUser } from "../services/jobQueue.js";
import { hasDatabase } from "../services/db.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Falta token." });
  }

  try {
    const decoded = jwt.verify(token, process.env.AUTH_JWT_SECRET || "dev_secret_change_this");
    req.authUser = {
      id: String(decoded?.id || "").trim(),
      token,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido o vencido." });
  }
}

function buildJobType(payload = {}, message = "") {
  const action = String(payload?.action || "").trim();
  const text = String(message || "").toLowerCase();

  if (action) {
    if (action.includes("eliminar")) return "eliminar_producto";
    if (action.includes("cambiar") || action.includes("agregar") || action.includes("quitar") || action.includes("ordenar") || action.includes("mover")) {
      return "editar_producto";
    }
  }

  if (text.includes("eliminar producto")) return "eliminar_producto";
  if (text.includes("crear producto") || text.includes("cargar producto") || text.includes("producto nuevo")) return "crear_producto";
  if (text.includes("editar producto") || text.includes("actualizar") || text.includes("cambiar ") || text.includes("modificar")) return "editar_producto";

  return "solicitud";
}

function buildJobTitle(type, payload = {}, message = "") {
  const productName =
    String(payload?.productName || "").trim() ||
    String(payload?.name || "").trim() ||
    String(payload?.nombre || "").trim() ||
    String(payload?.productLabel || "").trim() ||
    extractProductNameFromMessage(message);

  const safeName = productName || "sin nombre";

  if (type === "crear_producto") return `Carga de producto ${safeName}`;
  if (type === "editar_producto") return `Edición de producto ${safeName}`;
  if (type === "eliminar_producto") return `Eliminar producto ${safeName}`;
  return `Solicitud ${safeName}`;
}

function extractProductNameFromMessage(message = "") {
  const lines = String(message || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const namedLine = lines.find((line) => /^nombre\s*:/i.test(line));
  if (namedLine) return namedLine.replace(/^nombre\s*:/i, "").trim();

  const productLine = lines.find((line) => /^producto\s*:/i.test(line));
  if (productLine) return productLine.replace(/^producto\s*:/i, "").trim();

  const skuLine = lines.find((line) => /^sku\s*:/i.test(line));
  if (skuLine) return skuLine.replace(/^sku\s*:/i, "").trim();

  return lines[0] || "";
}

function sanitizeBody(body = {}) {
  const payloadRaw = body.payload;
  if (!payloadRaw) return {};

  if (typeof payloadRaw === "string") {
    try {
      return JSON.parse(payloadRaw);
    } catch {
      return {};
    }
  }

  return payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
}

function saveQueuedFiles(files = []) {
  const targetDir = path.join(process.cwd(), "uploads", "jobs");

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  return files.map((file, index) => {
    const originalName = String(file.originalname || `image-${index + 1}`);
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const finalName = `${Date.now()}-${index + 1}-${safeName}`;
    const absolutePath = path.join(targetDir, finalName);
    fs.writeFileSync(absolutePath, file.buffer);

    return {
      originalname: originalName,
      mimetype: String(file.mimetype || "application/octet-stream"),
      size: Number(file.size || 0),
      path: absolutePath,
      filename: finalName,
    };
  });
}

router.get("/", requireAuth, async (req, res) => {
  if (!hasDatabase) {
    return res.status(500).json({ error: "La cola necesita base de datos configurada." });
  }

  const limit = Number(req.query.limit || 100);
  const jobs = await listJobsByUser(req.authUser.id, limit);

  return res.json({
    jobs: jobs.map((job) => ({
      ...job,
      status_label: mapStatusLabel(job.status),
    })),
  });
});

router.get("/:id", requireAuth, async (req, res) => {
  if (!hasDatabase) {
    return res.status(500).json({ error: "La cola necesita base de datos configurada." });
  }

  const job = await getJobByIdForUser(req.params.id, req.authUser.id);

  if (!job) {
    return res.status(404).json({ error: "No encontré ese proceso." });
  }

  return res.json({
    job: {
      ...job,
      status_label: mapStatusLabel(job.status),
    },
  });
});

router.post("/", requireAuth, upload.array("images", 10), async (req, res) => {
  if (!hasDatabase) {
    return res.status(500).json({ error: "La cola necesita base de datos configurada." });
  }

  const message = String(req.body?.message || "").trim();
  const agentId = String(req.body?.agentId || "woocommerce-assistant").trim() || "woocommerce-assistant";
  const payload = sanitizeBody(req.body);
  const files = Array.isArray(req.files) ? req.files : [];

  if (!message) {
    return res.status(400).json({ error: "Falta message." });
  }

  const type = buildJobType(payload, message);
  const title = buildJobTitle(type, payload, message);
  const filePaths = saveQueuedFiles(files);

  const job = await createJob({
    userId: req.authUser.id,
    agentId,
    type,
    title,
    requestMessage: message,
    requestPayload: {
      body: { ...req.body, payload },
      headers: {
        authorization: `Bearer ${req.authUser.token}`,
      },
    },
    filePaths,
  });

  return res.status(201).json({
    ok: true,
    reply: `${title} en cola.`,
    job: {
      ...job,
      status_label: mapStatusLabel(job.status),
    },
  });
});

function mapStatusLabel(status) {
  if (status === "pending") return "en cola";
  if (status === "processing") return "en proceso";
  if (status === "completed") return "completado";
  if (status === "failed") return "fallido";
  return status || "";
}

export default router;
