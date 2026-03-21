import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import { claimNextPendingJob, markJobCompleted, markJobFailed } from "../services/jobQueue.js";
import { hasDatabase } from "../services/db.js";

let workerStarted = false;
let loopHandle = null;
let isProcessing = false;

function getServerBaseUrl() {
  const port = process.env.PORT || "3001";
  return process.env.INTERNAL_SERVER_URL || `http://127.0.0.1:${port}`;
}

async function processOneJob() {
  if (!hasDatabase || isProcessing) return;

  isProcessing = true;
  let currentJob = null;

  try {
    currentJob = await claimNextPendingJob();

    if (!currentJob) {
      return;
    }

    const url = `${getServerBaseUrl()}/run-agent`;
    const form = new FormData();
    const requestBody = currentJob.request_payload?.body || {};

    for (const [key, value] of Object.entries(requestBody)) {
      if (key === "payload") {
        form.append(key, JSON.stringify(value || {}));
      } else if (value != null) {
        form.append(key, String(value));
      }
    }

    for (const fileInfo of Array.isArray(currentJob.file_paths) ? currentJob.file_paths : []) {
      if (!fileInfo?.path || !fs.existsSync(fileInfo.path)) {
        continue;
      }

      form.append("images", fs.createReadStream(fileInfo.path), {
        filename: fileInfo.originalname || fileInfo.filename || "image",
        contentType: fileInfo.mimetype || "application/octet-stream",
      });
    }

    const response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        authorization: currentJob.request_payload?.headers?.authorization || "",
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 1000 * 60 * 10,
      validateStatus: () => true,
    });

    const data = response.data || {};

    if (response.status >= 200 && response.status < 300) {
      await markJobCompleted(currentJob.id, data);
    } else {
      await markJobFailed(currentJob.id, data?.error || `Falló con status ${response.status}.`, data);
    }
  } catch (error) {
    if (currentJob?.id) {
      await markJobFailed(
        currentJob.id,
        error?.response?.data?.error || error?.message || "Error procesando el trabajo.",
        error?.response?.data || {}
      ).catch(() => null);
    }
  } finally {
    isProcessing = false;
  }
}

export function startJobWorker() {
  if (workerStarted) return;
  workerStarted = true;

  loopHandle = setInterval(() => {
    processOneJob().catch(() => null);
  }, 2000);

  setTimeout(() => {
    processOneJob().catch(() => null);
  }, 1200);

  if (loopHandle?.unref) {
    loopHandle.unref();
  }
}
