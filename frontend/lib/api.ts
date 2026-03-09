const API_BASE_URL = "http://localhost:3001";

export async function listAgents() {
  const res = await fetch(`${API_BASE_URL}/agents`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("No se pudieron cargar los agentes");
  }

  return res.json();
}
export async function runAgent(agentId: string, message: string) {
  const form = new FormData();

  form.append("agentId", agentId);
  form.append("message", message);

  const res = await fetch(`${API_BASE_URL}/run-agent`, {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    throw new Error("Error ejecutando agente");
  }

  return res.json();
}