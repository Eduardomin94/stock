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
const MAX_CONCURRENT_JOBS = Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS || 5));
const MAX_CONCURRENT_JOBS_PER_USER = Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS_PER_USER || 1));

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
const activeJobIds = new Set();
const activeJobsByUser = new Map();

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

function getUserQueueKey(userId) {
  return String(userId || '__anonymous__');
}

function getActiveJobsForUser(userId) {
  return activeJobsByUser.get(getUserQueueKey(userId)) || 0;
}

function incrementActiveJobsForUser(userId) {
  const key = getUserQueueKey(userId);
  activeJobsByUser.set(key, getActiveJobsForUser(userId) + 1);
}

function decrementActiveJobsForUser(userId) {
  const key = getUserQueueKey(userId);
  const current = getActiveJobsForUser(userId);

  if (current <= 1) {
    activeJobsByUser.delete(key);
    return;
  }

  activeJobsByUser.set(key, current - 1);
}

function canStartJob(job) {
  if (!job || job.status !== 'pending') return false;
  if (activeJobIds.size >= MAX_CONCURRENT_JOBS) return false;
  if (getActiveJobsForUser(job.userId) >= MAX_CONCURRENT_JOBS_PER_USER) return false;
  return true;
}

function humanizeAttributesText(text = '') {
  return String(text || '')
    .split('|')
    .map((part) => String(part || '').split(':').slice(1).join(':').trim() || String(part || '').trim())
    .filter(Boolean)
    .join(' / ');
}

function translateStockStatus(status) {
  if (status === 'instock') return 'Disponible';
  if (status === 'outofstock') return 'Agotado';
  if (status === 'onbackorder') return 'En espera';
  return String(status || '').trim();
}

function buildStockChangeLabel(item) {
  const variationLabel = humanizeAttributesText(item?.attributes_text || `Variación #${item?.variation_id || ''}`);
  const before = item?.previous_manage_stock
    ? `${item?.previous_stock_quantity ?? 0} unidades`
    : translateStockStatus(item?.previous_stock_status);
  const after = item?.manage_stock
    ? `${item?.stock_quantity ?? 0} unidades`
    : translateStockStatus(item?.stock_status);

  if (before && after && before !== after) {
    return `${variationLabel}: ${before} → ${after}`;
  }

  return `${variationLabel}: ${after || 'actualizado'}`;
}

function buildCompletedTitle(message = '', data = {}) {
  const text = String(message || '');
  if (!text.startsWith('__edit_product_action__:')) return '';

  try {
    const payload = JSON.parse(text.replace('__edit_product_action__:', ''));
    const action = String(payload?.action || '').trim();
    const toolResult = data?.toolResult || {};
    const productLabel = String(toolResult?.name || payload?.productName || '').trim() || (payload?.productId ? `#${payload.productId}` : '');
    const productSuffix = productLabel ? ` ${productLabel}` : '';

    if (action === 'cambiar_stock') {
      const changes = Array.isArray(toolResult?.results) ? toolResult.results : [];
      if (changes.length > 0) {
        const visible = changes.slice(0, 2).map(buildStockChangeLabel).filter(Boolean);
        const extra = changes.length - visible.length;
        const changesLabel = extra > 0 ? `${visible.join(' | ')} y ${extra} más` : visible.join(' | ');
        return `Cambio de stock de producto${productSuffix}: ${changesLabel} completado`;
      }
      return `Cambio de stock de producto${productSuffix} completado`;
    }

    switch (action) {
      case 'cambiar_precio':
        return `Cambio de precio de producto${productSuffix} completado`;
      case 'agregar_precio_rebajado':
      case 'cambiar_precio_rebajado':
      case 'quitar_precio_rebajado':
        return `Cambio de precio rebajado de producto${productSuffix} completado`;
      case 'cambiar_precio_efectivo':
        return `Cambio de precio en efectivo de producto${productSuffix} completado`;
      case 'agregar_fotos_producto':
        return `Carga de fotos de producto${productSuffix} completado`;
      case 'eliminar_fotos_producto':
        return `Eliminar fotos de producto${productSuffix} completado`;
      case 'ordenar_fotos_producto':
        return `Ordenar fotos de producto${productSuffix} completado`;
      case 'cambiar_fotos_variantes':
        return `Cambio de fotos por variante de producto${productSuffix} completado`;
      case 'quitar_fotos_variantes':
        return `Quitar fotos por variante de producto${productSuffix} completado`;
      case 'agregar_variacion':
        return `Agregar variación de producto${productSuffix} completado`;
      case 'eliminar_variacion':
        return `Eliminar variación de producto${productSuffix} completado`;
      case 'agregar_atributo_variaciones':
        return `Expandir variaciones de producto${productSuffix} completado`;
      case 'cambiar_categorias':
        return `Cambio de categorías de producto${productSuffix} completado`;
      case 'cambiar_descripcion':
        return `Cambio de descripción de producto${productSuffix} completado`;
      case 'mover_producto_fecha':
        return `Cambio de posición de producto${productSuffix} completado`;
      case 'cambiar_nombre_sku':
        return `Cambio de nombre y SKU de producto${productSuffix} completado`;
      default:
        return `Edición de producto${productSuffix} completado`;
    }
  } catch {
    return '';
  }
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
      switch (payload?.action) {
        case 'cambiar_stock': return `Cambio de stock de producto${productSuffix} en proceso`;
        case 'cambiar_precio': return `Cambio de precio de producto${productSuffix} en proceso`;
        case 'agregar_precio_rebajado':
        case 'cambiar_precio_rebajado':
        case 'quitar_precio_rebajado': return `Cambio de precio rebajado de producto${productSuffix} en proceso`;
        case 'cambiar_precio_efectivo': return `Cambio de precio en efectivo de producto${productSuffix} en proceso`;
        case 'agregar_fotos_producto': return `Carga de fotos de producto${productSuffix} en proceso`;
        case 'eliminar_fotos_producto': return `Eliminar fotos de producto${productSuffix} en proceso`;
        case 'ordenar_fotos_producto': return `Ordenar fotos de producto${productSuffix} en proceso`;
        case 'cambiar_fotos_variantes': return `Cambio de fotos por variante de producto${productSuffix} en proceso`;
        case 'quitar_fotos_variantes': return `Quitar fotos por variante de producto${productSuffix} en proceso`;
        case 'agregar_variacion': return `Agregar variación de producto${productSuffix} en proceso`;
        case 'eliminar_variacion': return `Eliminar variación de producto${productSuffix} en proceso`;
        case 'agregar_atributo_variaciones': return `Expandir variaciones de producto${productSuffix} en proceso`;
        case 'cambiar_categorias': return `Cambio de categorías de producto${productSuffix} en proceso`;
        case 'cambiar_descripcion': return `Cambio de descripción de producto${productSuffix} en proceso`;
        case 'mover_producto_fecha': return `Cambio de posición de producto${productSuffix} en proceso`;
        case 'cambiar_nombre_sku': return `Cambio de nombre y SKU de producto${productSuffix} en proceso`;
        default: return `Edición de producto${productSuffix} en proceso`;
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
  const status = String(job.status || '').toLowerCase();
  const shouldPersist = status === 'failed' || status === 'warning';

  if (!shouldPersist) {
    return;
  }

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

    if (job.userId) {
      await query(
        `DELETE FROM jobs_history
         WHERE user_id = $1
           AND id NOT IN (
             SELECT id
             FROM jobs_history
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50
           )`,
        [job.userId]
      );
    } else {
      await query(
        `DELETE FROM jobs_history
         WHERE user_id IS NULL
           AND id NOT IN (
             SELECT id
             FROM jobs_history
             WHERE user_id IS NULL
             ORDER BY created_at DESC
             LIMIT 50
           )`
      );
    }

    return;
  }

  const history = readFallbackHistory();
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

  const sameUserItems = history.filter(
    (item) => (item.userId || null) === (job.userId || null)
  );
  const otherUsersItems = history.filter(
    (item) => (item.userId || null) !== (job.userId || null)
  );

  const filteredSameUser = sameUserItems.filter((item) => item.id !== job.id);
  filteredSameUser.push(persisted);

  filteredSameUser.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  writeFallbackHistory([...otherUsersItems, ...filteredSameUser.slice(0, 50)]);
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

async function runJob(next) {
  next.status = 'processing';
  next.updatedAt = nowIso();
  activeJobIds.add(next.id);
  incrementActiveJobsForUser(next.userId);
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
    next.title = buildCompletedTitle(next.message, data) || next.title.replace(/ en proceso$/i, ' completado');
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

    activeJobIds.delete(next.id);
    decrementActiveJobsForUser(next.userId);

    setTimeout(() => {
      processQueue();
    }, 0);
  }
}

function processQueue() {
  while (activeJobIds.size < MAX_CONCURRENT_JOBS) {
    const next = jobs.find((job) => canStartJob(job));
    if (!next) break;

    runJob(next).catch((error) => {
      console.error('[jobs] Error no controlado al ejecutar job:', error);
    });
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
    if (!key.startsWith('imageColor_')) continue;

    const normalizedKey = key.slice('imageColor_'.length);
    imageColorMap[normalizedKey] = String(value || '');
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
  processQueue();

  res.status(202).json({ ok: true, job: publicJob(job) });
});

export default router;
