import { query, hasDatabase } from "./db.js";

export async function ensureJobsTable() {
  if (!hasDatabase) return;

  await query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT DEFAULT 'woocommerce-assistant',
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      request_message TEXT DEFAULT '',
      request_payload JSONB DEFAULT '{}'::jsonb,
      file_paths JSONB DEFAULT '[]'::jsonb,
      result_payload JSONB DEFAULT '{}'::jsonb,
      error_message TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      started_at TIMESTAMP NULL,
      finished_at TIMESTAMP NULL
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_jobs_user_created_at ON jobs(user_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at ON jobs(status, created_at ASC)`);
}

export async function createJob({ userId, agentId, type, title, requestMessage, requestPayload, filePaths }) {
  const result = await query(
    `
      INSERT INTO jobs (
        user_id,
        agent_id,
        type,
        title,
        status,
        request_message,
        request_payload,
        file_paths
      )
      VALUES ($1, $2, $3, $4, 'pending', $5, $6::jsonb, $7::jsonb)
      RETURNING *
    `,
    [
      String(userId),
      String(agentId || 'woocommerce-assistant'),
      String(type || 'otro'),
      String(title || 'Solicitud'),
      String(requestMessage || ''),
      JSON.stringify(requestPayload || {}),
      JSON.stringify(Array.isArray(filePaths) ? filePaths : []),
    ]
  );

  return normalizeJob(result.rows[0]);
}

export async function listJobsByUser(userId, limit = 100) {
  const result = await query(
    `
      SELECT *
      FROM jobs
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [String(userId), Number(limit) || 100]
  );

  return result.rows.map(normalizeJob);
}

export async function getJobByIdForUser(jobId, userId) {
  const result = await query(
    `SELECT * FROM jobs WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [Number(jobId), String(userId)]
  );

  return normalizeJob(result.rows[0] || null);
}

export async function claimNextPendingJob() {
  const result = await query(`
    WITH next_job AS (
      SELECT j.id
      FROM jobs j
      WHERE j.status = 'pending'
        AND NOT EXISTS (
          SELECT 1
          FROM jobs active
          WHERE active.user_id = j.user_id
            AND active.status = 'processing'
        )
      ORDER BY j.created_at ASC, j.id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE jobs j
    SET status = 'processing',
        started_at = NOW(),
        error_message = ''
    FROM next_job
    WHERE j.id = next_job.id
    RETURNING j.*
  `);

  return normalizeJob(result.rows[0] || null);
}

export async function markJobCompleted(jobId, resultPayload = {}) {
  const result = await query(
    `
      UPDATE jobs
      SET status = 'completed',
          finished_at = NOW(),
          result_payload = $2::jsonb,
          error_message = ''
      WHERE id = $1
      RETURNING *
    `,
    [Number(jobId), JSON.stringify(resultPayload || {})]
  );

  return normalizeJob(result.rows[0] || null);
}

export async function markJobFailed(jobId, errorMessage, resultPayload = {}) {
  const result = await query(
    `
      UPDATE jobs
      SET status = 'failed',
          finished_at = NOW(),
          error_message = $2,
          result_payload = $3::jsonb
      WHERE id = $1
      RETURNING *
    `,
    [Number(jobId), String(errorMessage || 'Error desconocido'), JSON.stringify(resultPayload || {})]
  );

  return normalizeJob(result.rows[0] || null);
}

function normalizeJob(job) {
  if (!job) return null;

  return {
    id: Number(job.id),
    user_id: String(job.user_id || ''),
    agent_id: String(job.agent_id || 'woocommerce-assistant'),
    type: String(job.type || ''),
    title: String(job.title || ''),
    status: String(job.status || 'pending'),
    request_message: String(job.request_message || ''),
    request_payload: job.request_payload || {},
    file_paths: Array.isArray(job.file_paths) ? job.file_paths : [],
    result_payload: job.result_payload || {},
    error_message: String(job.error_message || ''),
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
  };
}
