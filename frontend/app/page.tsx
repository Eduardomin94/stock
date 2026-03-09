"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AgentList from "@/components/AgentList";
import ChatWindow from "@/components/ChatWindow";
import { listAgents } from "@/lib/api";

type Agent = {
  id: string;
  name: string;
};

export default function Page() {
  const router = useRouter();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [error, setError] = useState("");

  function handleLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  router.push("/login");
}

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
      return;
    }

    setAuthChecking(false);
  }, [router]);

  useEffect(() => {
    if (authChecking) return;

    async function loadAgents() {
      try {
        setLoading(true);
        setError("");

        const data = await listAgents();
        setAgents(data);

        if (Array.isArray(data) && data.length > 0) {
          setSelectedAgentId(data[0].id);
        }
      } catch {
        setError("No se pudieron cargar los agentes");
      } finally {
        setLoading(false);
      }
    }

    loadAgents();
  }, [authChecking]);

  const selectedAgent = useMemo(() => {
    return agents.find((agent) => agent.id === selectedAgentId) || null;
  }, [agents, selectedAgentId]);
const [userEmail, setUserEmail] = useState("");

useEffect(() => {
  const userRaw = localStorage.getItem("user");

  if (userRaw) {
    try {
      const user = JSON.parse(userRaw);
      setUserEmail(user.email || "");
    } catch {}
  }
}, []);
  
  if (authChecking) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#030712",
          color: "white",
          display: "grid",
          placeItems: "center",
          padding: 24,
        }}
      >
        Verificando sesión...
      </main>
    );
  }

  

  return (
    <main
      style={{
        padding: 24,
        minHeight: "100vh",
        background: "#030712",
        color: "white",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 16,
      marginBottom: 24,
      flexWrap: "wrap",
    }}
  >
    <div>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
        AI WooCommerce Manager
      </h1>

      <p style={{ color: "#9ca3af" }}>
        Seleccioná un agente y hablá con él.
      </p>
    </div>

    <button
      onClick={handleLogout}
      style={{
        height: 44,
        padding: "0 16px",
        borderRadius: 12,
        border: "1px solid #243041",
        background: "#0b1220",
        color: "white",
        cursor: "pointer",
      }}
    >
      Cerrar sesión
    </button>
  </div>
        {loading && <p>Cargando agentes...</p>}
        {error && <p>{error}</p>}

        {!loading && !error && (
          <div className="page-layout">
            <div style={{ minWidth: 0 }}>
              <AgentList
                agents={agents}
                selectedAgentId={selectedAgentId}
                onSelect={setSelectedAgentId}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              {selectedAgent ? (
                <ChatWindow
                  agentId={selectedAgent.id}
                  agentName={selectedAgent.name}
                />
              ) : (
                <div
                  style={{
                    border: "1px solid #1f2937",
                    borderRadius: 16,
                    background: "#0b1220",
                    minHeight: 520,
                    padding: 24,
                    color: "#9ca3af",
                  }}
                >
                  Seleccioná un agente para empezar.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}