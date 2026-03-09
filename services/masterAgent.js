import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AGENTS_FILE = path.join(__dirname, "../data/agents.json");

export function loadAgents() {
  if (!fs.existsSync(AGENTS_FILE)) return [];
  const raw = fs.readFileSync(AGENTS_FILE, "utf-8");
  return raw ? JSON.parse(raw) : [];
}

export function saveAgents(agents) {
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2), "utf-8");
}

export function findAgent(agentId) {
  const agents = loadAgents();
  return agents.find(a => a.id === agentId);
}

export function updateAgent(agentId, newData) {
  const agents = loadAgents();

  const index = agents.findIndex(a => a.id === agentId);

  if (index === -1) {
    return null;
  }

  agents[index] = {
    ...agents[index],
    ...newData,
    updated_at: new Date().toISOString()
  };

  saveAgents(agents);

  return agents[index];
}

export function loadAgentDrafts() {
  const draftsFile = path.join(__dirname, "../data/agentDrafts.json");

  if (!fs.existsSync(draftsFile)) return {};

  const raw = fs.readFileSync(draftsFile, "utf-8");
  return raw ? JSON.parse(raw) : {};
}

export function saveAgentDrafts(drafts) {
  const draftsFile = path.join(__dirname, "../data/agentDrafts.json");
  fs.writeFileSync(draftsFile, JSON.stringify(drafts, null, 2), "utf-8");
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
    "system_prompt"
  ];

  const missing = [];

  for (const field of requiredFields) {
    if (!agent[field]) {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
}

export function repairAgent(agent) {

  const validation = validateAgent(agent);

  if (validation.valid) {
    return {
      repaired: false,
      agent
    };
  }

  const repairedAgent = { ...agent };

  for (const field of validation.missing) {

    if (field === "capabilities") repairedAgent[field] = [];
    else if (field === "limitations") repairedAgent[field] = [];
    else if (field === "tools") repairedAgent[field] = [];
    else if (field === "safety_rules") repairedAgent[field] = [];
    else if (field === "example_requests") repairedAgent[field] = [];
    else repairedAgent[field] = "";

  }

  repairedAgent.repaired_at = new Date().toISOString();

  return {
    repaired: true,
    agent: repairedAgent,
    missing: validation.missing
  };
}
export function auditAgents() {

  const agents = loadAgents();

  const report = {
    total_agents: agents.length,
    repaired: [],
    healthy: []
  };

  const updatedAgents = [];

  for (const agent of agents) {

    const result = repairAgent(agent);

    if (result.repaired) {

      report.repaired.push({
        id: agent.id,
        name: agent.name,
        missing: result.missing
      });

      updatedAgents.push(result.agent);

    } else {

      report.healthy.push({
        id: agent.id,
        name: agent.name
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

  const prompt = `
Sos un ingeniero experto en diseño de agentes de inteligencia artificial.

Tu trabajo es mejorar este agente.

Reglas:

- mantener la misma estructura
- mejorar claridad
- mejorar capabilities
- mejorar system_prompt
- agregar mejores safety_rules
- no eliminar funcionalidades existentes
- devolver JSON válido

AGENTE ACTUAL:

${JSON.stringify(agent, null, 2)}

Devolvé el agente mejorado.
`;

  const response = await client.responses.create({
    model: "gpt-5",
    input: prompt
  });

  const text = response.output_text || "";

  let improved;

  try {
    improved = JSON.parse(text);
  } catch {
    throw new Error("La IA no devolvió JSON válido");
  }

  return improved;
}