"use client";

type Agent = {
  id: string;
  name: string;
};

type AgentListProps = {
  agents: Agent[];
  selectedAgentId: string;
  onSelect: (agentId: string) => void;
};

export default function AgentList({
  agents,
  selectedAgentId,
  onSelect,
}: AgentListProps) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {agents.map((agent) => {
        const isSelected = agent.id === selectedAgentId;

        return (
          <button
            key={agent.id}
            onClick={() => onSelect(agent.id)}
            style={{
              textAlign: "left",
              padding: "14px 16px",
              borderRadius: 12,
              border: isSelected ? "2px solid #2563eb" : "1px solid #333",
              background: isSelected ? "#111827" : "#0b0b0b",
              color: "white",
              cursor: "pointer",
            }}
          >
            {agent.name}
          </button>
        );
      })}
    </div>
  );
}