import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRAFTS_FILE = path.join(__dirname, "../data/agentDrafts.json");

export function loadAgentDrafts() {
  if (!fs.existsSync(DRAFTS_FILE)) return {};

  try {
    const raw = fs.readFileSync(DRAFTS_FILE, "utf-8");
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAgentDrafts(drafts) {
  const safeDrafts = drafts && typeof drafts === "object" ? drafts : {};
  fs.writeFileSync(DRAFTS_FILE, JSON.stringify(safeDrafts, null, 2), "utf-8");
}

export function savePendingDraft(agentId, data) {
  const drafts = loadAgentDrafts();

  drafts[agentId] = {
    ...data,
    updated_at: new Date().toISOString(),
  };

  saveAgentDrafts(drafts);

  return drafts[agentId];
}

export function getPendingDraft(agentId) {
  const drafts = loadAgentDrafts();
  return drafts[agentId] || null;
}

export function clearPendingDraft(agentId) {
  const drafts = loadAgentDrafts();

  if (drafts[agentId]) {
    delete drafts[agentId];
    saveAgentDrafts(drafts);
  }

  return true;
}