import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { query, hasDatabase } from '../services/db.js';

const router = express.Router();
const TMP_DIR = path.join(os.tmpdir(), 'tonica-stock-jobs');
const FALLBACK_FILE = path.join(process.cwd(), 'data', 'jobs-history.json');
fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(path.dirname(FALLBACK_FILE), { recursive: true });

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

function getUserIdFromReq(req) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return null;

    const decoded = jwt.verify(
      token,
      process.env.AUTH_JWT_SECRET || 'dev_secret_change_this'
    );

    return String(decoded?.id || '').trim() || null;
  } catch {
    return null;
  }
}

function formatVariantLabelFromItem(item) {
  if (!item) return '';

  if (Array.isArray(item)) {
    return item
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' / ');
  }

  if (typeof item === 'object') {
    if (Array.isArray(item.attributes) && item.attributes.length > 0) {
      const fromAttributes = item.attributes
        .map((attr) => String(attr?.option || attr?.value || '').trim())
        .filter(Boolean)
        .join(' / ');

      if (fromAttributes) return fromAttributes;
    }

    const entries = Object.entries(item)
      .filter(([key, value]) => {
        if (value === null || value === undefined) return false;
        const cleanKey = String(key || '').trim().toLowerCase();
        return ![
          'id',
          'variation_id',
          'productid',
          'product_id',
          'manage_stock',
          'stock_quantity',
          'stock_status',
          'stock_touched',
          'status_touched',
          'touched',
          'selected',
          'checked',
          'image',
          'imageid',
          'image_id',
          'src',
          'name',
        ].includes(cleanKey);
      })
      .map(([, value]) => String(value || '').trim())
      .filter(Boolean);

    return entries.join(' / ');
  }

  return '';
}

function uniqueVariantLabels(labels = []) {
  const seen = new Set();
  const result = [];

  for (const raw of labels) {
    const label = String(raw || '').trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }

  return result;
}

function extractEditedVariantLabels(payload = {}) {
  const selectedLabels = uniqueVariantLabels(
    (Array.isArray(payload?.selectedCombinations) ? payload.selectedCombinations : [])
      .map(formatVariantLabelFromItem)
  );

  if (selectedLabels.length > 0) return selectedLabels;

  const touchedVariationLabels = uniqueVariantLabels(
    (Array.isArray(payload?.variations) ? payload.variations : [])
      .filter((variation) => {
        if (!variation || typeof variation !== 'object') return false;
        return Boolean(
          variation.stock_touched ||
          variation.status_touched ||
          variation.touched ||
          variation.manage_stock_touched
        );
      })
      .map(formatVariantLabelFromItem)
  );

  if (touchedVariationLabels.length > 0) return touchedVariationLabels;

  return [];
}

function buildVariantSuffix(payload = {}) {
  const labels = extractEditedVariantLabels(payload);
  if (labels.length === 0) return '';
  if (labels.length === 1) return ` (${labels[0]})`;
  if (labels.length === 2) return ` (${labels[0]} y ${labels[1]})`;
  return ` (${labels[0]}, ${labels[1]} y ${labels.length - 2} más)`;
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
      const productLabel = String(payload?.productName || '').trim() || (payload?.productId ? `#${payload.productId}` : '');
      const productSuffix = productLabel ? ` ${productLabel}` : '';
      const variantSuffix = buildVariantSuffix(payload);
      switch (payload?.action) {
        case 'cambiar_stock': return `Cambio de stock de producto${productSuffix}${variantSuffix} en proceso`;
        case 'cambiar_precio': return `Cambio de precio de producto${productSuffix}${variantSuffix} en proceso`;
        case 'agregar_precio_rebajado':
        case 'cambiar_precio_rebajado': return `Cambio de precio rebajado de producto${productSuffix}${variantSuffix} en proceso`;
        case 'quitar_precio_rebajado': return `Quitar precio rebajado de producto${productSuffix}${variantSuffix} en proceso`;
        case 'cambiar_precio_efectivo': return `Cambio de precio en efectivo de producto${productSuffix}${variantSuffix} en proceso`;
        case 'agregar_fotos_producto': return `Carga de fotos de producto${productSuffix} en proceso`;
        case 'eliminar_fotos_producto': return `Eliminar fotos de producto${productSuffix} en proceso`;
        case 'ordenar_fotos_producto': return `Ordenar fotos de producto${productSuffix} en proceso`;
        case 'cambiar_fotos_variantes': return `Carga de fotos por variante de producto${productSuffix}${variantSuffix} en proceso`;
        case 'quitar_fotos_variantes': return `Quitar fotos por variante de producto${productSuffix}${variantSuffix} en proceso`;
        case 'cambiar_categorias': return `Cambio de categorías de producto${productSuffix} en proceso`;
        default: return `Edición de producto${productSuffix}${variantSuffix} en proceso`;
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

function ensureFallbackFile() {
  if (!fs.existsSync(FALLBACK_FILE)) {
    fs.writeFileSync(FALLBACK_FILE, '[]', 'utf-8');
  }
}

function readFallbackHistory() {
  ensureFallbackFile();
  try {
    const raw = fs.readFileSync(FALLBACK_FILE, 'utf-8');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeFallbackHistory(items) {
  ensureFallbackFile();
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

async function persistJob(job) {
  if (hasDatabase) {
    await query(
      `INSERT INTO jobs_history (
        id, user_id, agent_id, message, title, status, created_at, updated_at, result_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at,
        result_message = EXCLUDED.result_message`,
      [
        job.id,
        job.userId || null,
        job.agentId || '',
        job.message || '',
        job.title || '',
        job.status || 'pending',
        job.createdAt || nowIso(),
        job.updatedAt || nowIso(),
        job.resultMessage || '',
      ]
    );
    return;
  }

  const history = readFallbackHistory();
  const index = history.findIndex((item) => item.id === job.id);
  const persisted = {
    id: job.id,
    userId: job.userId || null,
    agentId: job.agentId || '',
    message: job.message || '',
    title: job.title || '',
    status: job.status || 'pending',
    createdAt: job.createdAt || nowIso(),
    updatedAt: job.updatedAt || nowIso(),
    resultMessage: job.resultMessage || '',
  };

  if (index >= 0) history[index] = persisted;
  else history.push(persisted);

  writeFallbackHistory(history);
}

async function listPersistedJobs(userId) {
  if (hasDatabase) {
    const result = userId
      ? await query(
          `SELECT id, title, status, created_at, updated_at, result_message
           FROM jobs_history
           WHERE user_id = $1
           ORDER BY created_at DESC`,
          [userId]
        )
      : await query(
          `SELECT id, title, status, created_at, updated_at, result_message
           FROM jobs_history
           WHERE user_id IS NULL
           ORDER BY created_at DESC`
        );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resultMessage: row.result_message || '',
    }));
  }

  return readFallbackHistory()
    .filter((item) => (item.userId || null) === (userId || null))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      resultMessage: item.resultMessage || '',
    }));
}

async function clearPersistedJobs(userId) {
  if (hasDatabase) {
    if (userId) {
      await query(`DELETE FROM jobs_history WHERE user_id = $1`, [userId]);
    } else {
      await query(`DELETE FROM jobs_history WHERE user_id IS NULL`);
    }
    return;
  }

  const filtered = readFallbackHistory().filter(
    (item) => (item.userId || null) !== (userId || null)
  );
  writeFallbackHistory(filtered);
}

async function processNext() {
  if (isProcessing) return;
  const next = jobs.find((j) => j.status === 'pending');
  if (!next) return;

  isProcessing = true;
  next.status = 'processing';
  next.updatedAt = nowIso();
  await persistJob(next);

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
    await persistJob(next);
  } catch (error) {
    next.status = 'failed';
    next.resultMessage = error instanceof Error ? error.message : 'Error al ejecutar el proceso';
    next.title = next.title.replace(/ en proceso$/i, ' fallido');
    next.updatedAt = nowIso();
    await persistJob(next);
  } finally {
    for (const file of next.files || []) {
      try { await fs.promises.unlink(file.path); } catch {}
    }
    const index = jobs.findIndex((item) => item.id === next.id);
    if (index >= 0) jobs.splice(index, 1);
    isProcessing = false;
    setTimeout(() => {
      processNext().catch(() => {});
    }, 0);
  }
}

router.get('/', async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    const queueJobs = jobs
      .filter((job) => (job.userId || null) === (userId || null))
      .map(publicJob);

    const persistedJobs = await listPersistedJobs(userId);
    const queueIds = new Set(queueJobs.map((job) => job.id));
    const history = persistedJobs.filter((job) => !queueIds.has(job.id));

    res.json([...queueJobs.reverse(), ...history]);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo obtener el historial de procesos' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);

    for (let i = jobs.length - 1; i >= 0; i -= 1) {
      const job = jobs[i];
      if ((job.userId || null) === (userId || null) && job.status !== 'processing') {
        for (const file of job.files || []) {
          try { await fs.promises.unlink(file.path); } catch {}
        }
        jobs.splice(i, 1);
      }
    }

    await clearPersistedJobs(userId);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo borrar el historial de procesos' });
  }
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
    userId: getUserIdFromReq(req),
    agentId,
    message,
    title: parseTitle(message),
    status: 'pending',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    resultMessage: '',
    authHeader: req.headers.authorization || '',
    imageColorMap,
    files: (req.files || []).map((file) => ({
      path: file.path,
      originalname: file.originalname,
      mimetype: file.mimetype,
    })),
  };

  jobs.push(job);
  await persistJob(job);
  processNext().catch(() => {});

  res.status(202).json({ ok: true, job: publicJob(job) });
});

export default router;
