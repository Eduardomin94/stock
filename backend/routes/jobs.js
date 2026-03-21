import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import multer from 'multer';

const router = express.Router();
const TMP_DIR = path.join(os.tmpdir(), 'tonica-stock-jobs');
fs.mkdirSync(TMP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TMP_DIR),
  filename: (_req, file, cb) => {
    const safe = String(file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

const jobs = [];
let isProcessing = false;

function nowIso() {
  return new Date().toISOString();
}

function parseTitle(message = '') {
  const text = String(message || '');
  const lower = text.toLowerCase();
  const findField = (label) => {
    const line = text.split('\n').find((x) => x.toLowerCase().startsWith(`${label}:`));
    return line ? line.split(':').slice(1).join(':').trim() : '';
  };

  if (text.startsWith('__edit_product_action__:')) {
    try {
      const payload = JSON.parse(text.replace('__edit_product_action__:', ''));
      const productId = payload?.productId ? ` #${payload.productId}` : '';
      switch (payload?.action) {
        case 'cambiar_stock': return `Edición de producto${productId} en proceso`;
        case 'agregar_fotos_producto': return `Carga de fotos de producto${productId} en proceso`;
        case 'eliminar_fotos_producto': return `Eliminar fotos de producto${productId} en proceso`;
        case 'ordenar_fotos_producto': return `Ordenar fotos de producto${productId} en proceso`;
        case 'cambiar_fotos_variantes': return `Carga de fotos por variante${productId} en proceso`;
        case 'quitar_fotos_variantes': return `Quitar fotos por variante${productId} en proceso`;
        case 'cambiar_categorias': return `Cambio de categorías de producto${productId} en proceso`;
        default: return `Edición de producto${productId} en proceso`;
      }
    } catch {
      return 'Edición de producto en proceso';
    }
  }

  if (lower.includes('crear producto variable') || lower.includes('crear producto simple')) {
    const name = findField('nombre');
    return `Carga de producto ${name || ''}`.trim() + ' en proceso';
  }

  if (lower.includes('eliminar producto')) {
    const sku = findField('sku');
    const nombre = findField('nombre');
    return `Eliminar producto ${sku || nombre || ''}`.trim() + ' en proceso';
  }

  return 'Proceso en curso';
}

function publicJob(job) {
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    resultMessage: job.resultMessage || '',
  };
}

async function processNext() {
  if (isProcessing) return;
  const next = jobs.find((j) => j.status === 'pending');
  if (!next) return;

  isProcessing = true;
  next.status = 'processing';
  next.updatedAt = nowIso();

  try {
    const form = new FormData();
    form.append('agentId', next.agentId);
    form.append('message', next.message);

    for (const key of Object.keys(next.imageColorMap || {})) {
      form.append(`imageColor_${key}`, next.imageColorMap[key] || '');
    }

    for (const file of next.files || []) {
      const buffer = await fs.promises.readFile(file.path);
      const blob = new Blob([buffer], { type: file.mimetype || 'application/octet-stream' });
      form.append('images', blob, file.originalname || path.basename(file.path));
    }

    const base = process.env.INTERNAL_API_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3001}`;
    const res = await fetch(`${base.replace(/\/$/, '')}/run-agent`, {
      method: 'POST',
      headers: next.authHeader ? { Authorization: next.authHeader } : undefined,
      body: form,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.detail || data?.error || data?.message || 'Error al ejecutar el proceso');
    }

    next.status = 'completed';
    next.resultMessage = String(data?.reply || 'Proceso completado.');
    next.title = next.title.replace(/ en proceso$/i, ' completado');
    next.updatedAt = nowIso();
  } catch (error) {
    next.status = 'failed';
    next.resultMessage = error instanceof Error ? error.message : 'Error al ejecutar el proceso';
    next.title = next.title.replace(/ en proceso$/i, ' fallido');
    next.updatedAt = nowIso();
  } finally {
    for (const file of next.files || []) {
      try { await fs.promises.unlink(file.path); } catch {}
    }
    isProcessing = false;
    setTimeout(processNext, 0);
  }
}

router.get('/', (_req, res) => {
  res.json(jobs.slice().reverse().map(publicJob));
});

router.post('/', upload.array('images', 10), async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const agentId = String(req.body?.agentId || 'woocommerce-assistant').trim();

  if (!message) {
    return res.status(400).json({ error: "Falta 'message'" });
  }

  const imageColorMap = {};
  for (const [key, value] of Object.entries(req.body || {})) {
    if (key.startsWith('imageColor_')) imageColorMap[key] = String(value || '');
  }

  const job = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agentId,
    message,
    title: parseTitle(message),
    status: 'pending',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    authHeader: req.headers.authorization || '',
    imageColorMap,
    files: (req.files || []).map((file) => ({
      path: file.path,
      originalname: file.originalname,
      mimetype: file.mimetype,
    })),
  };

  jobs.push(job);
  processNext().catch(() => {});

  res.status(202).json({ ok: true, job: publicJob(job) });
});

export default router;
