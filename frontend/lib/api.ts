const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");

export async function runAgent(message: string, files: File[] = []) {
  const form = new FormData();

  form.append("agentId", "woocommerce-assistant");
  form.append("message", message);

  for (const file of files) {
    form.append("images", file);
  }

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const res = await fetch(`${API_BASE_URL}/run-agent`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (!res.ok) {
    throw new Error("Error ejecutando agente");
  }

  return res.json();
}