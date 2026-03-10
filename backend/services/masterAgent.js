import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AGENTS_FILE = path.join(__dirname, "../data/agents.json");
const DRAFTS_FILE = path.join(__dirname, "../data/agentDrafts.json");

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAgentShape(agent = {}) {
  return {
    id: safeString(agent.id),
    name: safeString(agent.name),
    role: safeString(agent.role),
    objective: safeString(agent.objective),
    capabilities: safeArray(agent.capabilities),
    limitations: safeArray(agent.limitations),
    tools: safeArray(agent.tools),
    safety_rules: safeArray(agent.safety_rules),
    response_style: safeString(agent.response_style),
    example_requests: safeArray(agent.example_requests),
    system_prompt: safeString(agent.system_prompt),
    created_at: agent.created_at || undefined,
    updated_at: agent.updated_at || undefined,
    repaired_at: agent.repaired_at || undefined,
    created_by_master: Boolean(agent.created_by_master),
    repaired_by_master: Boolean(agent.repaired_by_master),
  };
}

export function loadAgents() {
  if (!fs.existsSync(AGENTS_FILE)) return [];

  try {
    const raw = fs.readFileSync(AGENTS_FILE, "utf-8");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAgents(agents) {
  const normalized = Array.isArray(agents)
    ? agents.map((agent) => normalizeAgentShape(agent))
    : [];

  fs.writeFileSync(AGENTS_FILE, JSON.stringify(normalized, null, 2), "utf-8");
}

export function findAgent(agentId) {
  const agents = loadAgents();
  return agents.find((a) => a.id === agentId);
}

export function updateAgent(agentId, newData) {
  const agents = loadAgents();

  const index = agents.findIndex((a) => a.id === agentId);

  if (index === -1) {
    return null;
  }

  agents[index] = normalizeAgentShape({
    ...agents[index],
    ...newData,
    updated_at: new Date().toISOString(),
  });

  saveAgents(agents);

  return agents[index];
}

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

export function validateAgent(agent) {
  const normalized = normalizeAgentShape(agent);

  const requiredFields = [
    "name",
    "role",
    "objective",
    "capabilities",
    "limitations",
    "tools",
    "safety_rules",
    "response_style",
    "example_requests",
    "system_prompt",
  ];

  const missing = [];

  for (const field of requiredFields) {
    const value = normalized[field];

    if (
      value === "" ||
      value === undefined ||
      value === null ||
      (Array.isArray(value) && value.length === 0)
    ) {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

export function repairAgent(agent) {
  const normalized = normalizeAgentShape(agent);
  const validation = validateAgent(normalized);

  if (validation.valid) {
    return {
      repaired: false,
      agent: normalized,
      missing: [],
    };
  }

  const repairedAgent = { ...normalized };

  if (!repairedAgent.name) repairedAgent.name = "Agente sin nombre";
  if (!repairedAgent.role) repairedAgent.role = "Asistente especializado";
  if (!repairedAgent.objective) {
    repairedAgent.objective = "Ayudar al usuario con su tarea específica";
  }
  if (!repairedAgent.response_style) {
    repairedAgent.response_style = "Claro, directo y profesional";
  }
  if (!repairedAgent.system_prompt) {
    repairedAgent.system_prompt =
      "Sos un agente especializado. Respondé con claridad, seguridad y sin inventar datos.";
  }

  if (!Array.isArray(repairedAgent.capabilities)) repairedAgent.capabilities = [];
  if (!Array.isArray(repairedAgent.limitations)) repairedAgent.limitations = [];
  if (!Array.isArray(repairedAgent.tools)) repairedAgent.tools = [];
  if (!Array.isArray(repairedAgent.safety_rules)) repairedAgent.safety_rules = [];
  if (!Array.isArray(repairedAgent.example_requests)) repairedAgent.example_requests = [];

  repairedAgent.repaired_at = new Date().toISOString();

  return {
    repaired: true,
    agent: repairedAgent,
    missing: validation.missing,
  };
}

export function auditAgents() {
  const agents = loadAgents();

  const report = {
    total_agents: agents.length,
    repaired: [],
    healthy: [],
  };

  const updatedAgents = [];

  for (const agent of agents) {
    const result = repairAgent(agent);

    if (result.repaired) {
      report.repaired.push({
        id: agent.id,
        name: agent.name,
        missing: result.missing,
      });

      updatedAgents.push(result.agent);
    } else {
      report.healthy.push({
        id: agent.id,
        name: agent.name,
      });

      updatedAgents.push(agent);
    }
  }

  saveAgents(updatedAgents);

  return report;
}

export async function improveAgent(agent) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const cleanAgent = normalizeAgentShape(agent);

  const prompt = `
Sos un ingeniero experto en diseño de agentes de inteligencia artificial.

Tu trabajo es mejorar este agente sin romperlo.

Reglas:
- mantener la misma estructura
- mejorar claridad
- mejorar capabilities
- mejorar system_prompt
- mejorar safety_rules
- no eliminar funcionalidades existentes
- no cambiar id
- devolver SOLO JSON válido
- respetar tipos: strings siguen siendo strings, arrays siguen siendo arrays

AGENTE ACTUAL:
${JSON.stringify(cleanAgent, null, 2)}
`;

  const response = await client.responses.create({
    model: "gpt-5",
    input: prompt,
  });

  const text = response.output_text || "";

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("La IA no devolvió JSON válido");
  }

  const merged = {
    ...cleanAgent,
    ...normalizeAgentShape(parsed),
    id: cleanAgent.id,
    updated_at: new Date().toISOString(),
  };

  return repairAgent(merged).agent;
}

export async function createAgentFromPrompt(requestText) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `
Sos un arquitecto de agentes de IA.

Creá un agente nuevo y devolvé SOLO JSON válido con estos campos:
name, role, objective, capabilities, limitations, tools, safety_rules, response_style, example_requests, system_prompt

Pedido del usuario:
${requestText}
`;

  const response = await client.responses.create({
    model: "gpt-5",
    input: prompt,
  });

  const text = response.output_text || "";

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("La IA no devolvió JSON válido al crear el agente");
  }

  const newAgent = repairAgent({
    id: Date.now().toString(),
    created_at: new Date().toISOString(),
    created_by_master: true,
    ...normalizeAgentShape(parsed),
  }).agent;

  const agents = loadAgents();
  agents.push(newAgent);
  saveAgents(agents);

  return newAgent;
}