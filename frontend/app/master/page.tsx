"use client";

import { useEffect, useMemo, useState } from "react";

type Agent = {
  id: string;
  name: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");

export default function MasterPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agentsError, setAgentsError] = useState("");

  const [masterAgentId, setMasterAgentId] = useState("");
  const [targetAgentId, setTargetAgentId] = useState("");
  const [message, setMessage] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function loadAgents() {
      try {
        setLoadingAgents(true);
        setAgentsError("");

        const res = await fetch(`${API}/agents`);
        if (!res.ok) {
          throw new Error("No se pudieron cargar los agentes");
        }

        const data = await res.json();
        const list = Array.isArray(data) ? data : [];

        setAgents(list);

        if (list.length > 0) {
          const masterCandidate =
            list.find((a: Agent) => a.name.toLowerCase().includes("maestro")) ||
            list[0];

          setMasterAgentId(masterCandidate?.id || "");
          setTargetAgentId(list[0]?.id || "");
        }
      } catch (error: any) {
        setAgentsError(error?.message || "Error cargando agentes");
      } finally {
        setLoadingAgents(false);
      }
    }

    loadAgents();
  }, []);

  const masterAgentName = useMemo(() => {
    return agents.find((a) => a.id === masterAgentId)?.name || "";
  }, [agents, masterAgentId]);

  const targetAgentName = useMemo(() => {
    return agents.find((a) => a.id === targetAgentId)?.name || "";
  }, [agents, targetAgentId]);

  function pushMessage(role: "user" | "assistant", text: string) {
    setMessages((prev) => [...prev, { role, text }]);
  }

  function buildImproveCommand() {
    if (!targetAgentId) return;
    setMessage(`mejora agente agentId=${targetAgentId}`);
  }

  function buildRepairCommand() {
    if (!targetAgentId) return;
    setMessage(`arregla agente agentId=${targetAgentId}`);
  }

  function buildAddFunctionPrompt() {
    if (!targetAgentId) return;

    setMessage(
      `Quiero mejorar el agente ${targetAgentName} (agentId=${targetAgentId}). ` +
        `Analizá qué le falta para poder agregar nuevas funciones de forma segura ` +
        `y proponeme primero los cambios exactos que harías en capabilities, tools, safety_rules y system_prompt.`
    );
  }

  async function sendMessage() {
    const cleanMessage = message.trim();

    if (!masterAgentId) {
      alert("Elegí el agente maestro primero.");
      return;
    }

    if (!cleanMessage) {
      alert("Escribí un mensaje.");
      return;
    }

    try {
      setSending(true);
      pushMessage("user", cleanMessage);
      setMessage("");

      const res = await fetch(`${API}/run-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: masterAgentId,
          message: cleanMessage,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Error al hablar con el agente maestro");
      }

      const reply =
        data?.reply ||
        data?.error ||
        "El agente maestro no devolvió respuesta.";

      pushMessage("assistant", reply);
    } catch (error: any) {
      pushMessage("assistant", `Error: ${error?.message || "No se pudo enviar el mensaje."}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Panel del Agente Maestro</h1>
            <p style={styles.subtitle}>
              Desde acá hablás con el agente maestro para mejorar otros agentes.
            </p>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.grid}>
            <div>
              <label style={styles.label}>Agente maestro</label>
              <select
                style={styles.select}
                value={masterAgentId}
                onChange={(e) => setMasterAgentId(e.target.value)}
                disabled={loadingAgents}
              >
                <option value="">Seleccionar</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={styles.label}>Agente objetivo</label>
              <select
                style={styles.select}
                value={targetAgentId}
                onChange={(e) => setTargetAgentId(e.target.value)}
                disabled={loadingAgents}
              >
                <option value="">Seleccionar</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loadingAgents && <p style={styles.info}>Cargando agentes...</p>}
          {!!agentsError && <p style={styles.error}>{agentsError}</p>}

          <div style={styles.badgeRow}>
            <span style={styles.badge}>
              Maestro: {masterAgentName || "sin seleccionar"}
            </span>
            <span style={styles.badge}>
              Objetivo: {targetAgentName || "sin seleccionar"}
            </span>
          </div>

          <div style={styles.quickActions}>
            <button type="button" style={styles.secondaryButton} onClick={buildImproveCommand}>
              Preparar “mejora agente”
            </button>

            <button type="button" style={styles.secondaryButton} onClick={buildRepairCommand}>
              Preparar “arregla agente”
            </button>

            <button type="button" style={styles.secondaryButton} onClick={buildAddFunctionPrompt}>
              Preparar pedido para agregar funciones
            </button>
          </div>

          <div style={styles.inputBlock}>
            <label style={styles.label}>Mensaje al agente maestro</label>
            <textarea
              style={styles.textarea}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escribí acá lo que le querés pedir al agente maestro..."
              rows={6}
            />
          </div>

          <div style={styles.actions}>
            <button
              type="button"
              style={styles.primaryButton}
              onClick={sendMessage}
              disabled={sending}
            >
              {sending ? "Enviando..." : "Enviar al agente maestro"}
            </button>
          </div>
        </div>

        <div style={styles.chatCard}>
          <h2 style={styles.chatTitle}>Conversación</h2>

          <div style={styles.chatBox}>
            {messages.length === 0 ? (
              <p style={styles.empty}>
                Todavía no mandaste mensajes. Probá con “Preparar mejora agente”.
              </p>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={`${msg.role}-${index}`}
                  style={{
                    ...styles.message,
                    ...(msg.role === "user" ? styles.userMessage : styles.assistantMessage),
                  }}
                >
                  <div style={styles.messageRole}>
                    {msg.role === "user" ? "Vos" : "Agente maestro"}
                  </div>
                  <div style={styles.messageText}>{msg.text}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={styles.notice}>
          <strong>Importante:</strong> con tu backend actual, el maestro ya entiende bien
          <code style={styles.code}> mejora agente agentId=...</code> y
          <code style={styles.code}> arregla agente agentId=...</code>.
          Para que realmente “agregue funciones” de manera automática a otro agente,
          después hay que ampliar la lógica en <code style={styles.code}>routes/runAgent.js</code>.
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0f172a",
    padding: "24px",
    color: "#e5e7eb",
  },
  container: {
    maxWidth: "1100px",
    margin: "0 auto",
    display: "grid",
    gap: "20px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
  },
  title: {
    margin: 0,
    fontSize: "32px",
    fontWeight: 700,
  },
  subtitle: {
    margin: "8px 0 0 0",
    color: "#94a3b8",
  },
  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: "18px",
    padding: "20px",
    display: "grid",
    gap: "16px",
  },
  chatCard: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: "18px",
    padding: "20px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#cbd5e1",
  },
  select: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e5e7eb",
    outline: "none",
  },
  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
  badge: {
    background: "#0f172a",
    border: "1px solid #334155",
    padding: "8px 12px",
    borderRadius: "999px",
    fontSize: "13px",
  },
  quickActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
  inputBlock: {
    display: "grid",
    gap: "8px",
  },
  textarea: {
    width: "100%",
    borderRadius: "14px",
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e5e7eb",
    padding: "14px",
    resize: "vertical",
    outline: "none",
    minHeight: "140px",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-start",
  },
  primaryButton: {
    border: "none",
    background: "#2563eb",
    color: "white",
    padding: "12px 18px",
    borderRadius: "12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e5e7eb",
    padding: "10px 14px",
    borderRadius: "12px",
    cursor: "pointer",
  },
  chatTitle: {
    marginTop: 0,
    marginBottom: "14px",
    fontSize: "22px",
  },
  chatBox: {
    display: "grid",
    gap: "12px",
  },
  message: {
    padding: "14px",
    borderRadius: "14px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  userMessage: {
    background: "#1d4ed8",
  },
  assistantMessage: {
    background: "#0f172a",
    border: "1px solid #334155",
  },
  messageRole: {
    fontSize: "12px",
    fontWeight: 700,
    marginBottom: "6px",
    opacity: 0.9,
  },
  messageText: {
    fontSize: "15px",
    lineHeight: 1.5,
  },
  empty: {
    margin: 0,
    color: "#94a3b8",
  },
  info: {
    margin: 0,
    color: "#93c5fd",
  },
  error: {
    margin: 0,
    color: "#fca5a5",
  },
  notice: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "16px",
    padding: "16px",
    color: "#cbd5e1",
    lineHeight: 1.5,
  },
  code: {
    marginLeft: "6px",
    marginRight: "6px",
    background: "#0f172a",
    padding: "2px 6px",
    borderRadius: "6px",
  },
};