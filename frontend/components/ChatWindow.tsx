"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  text: string;
};

type ChatWindowProps = {
  agentId: string;
  agentName: string;
};

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");

export default function ChatWindow({ agentId, agentName }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const storageKey = useMemo(() => {
  if (typeof window === "undefined") return "";
  const userRaw = localStorage.getItem("user");
  let userId = "guest";

  if (userRaw) {
    try {
      const user = JSON.parse(userRaw);
      userId = user?.id || "guest";
    } catch {}
  }

  return `chat_history_${userId}_${agentId}`;
}, [agentId]);

  async function handleSend(filesOverride?: File[]) {
    const filesToSend = filesOverride ?? selectedFiles;
    const cleanText = text.trim();

    if ((!cleanText && filesToSend.length === 0) || loading) return;

    const previewText =
      cleanText || `Adjuntaste ${filesToSend.length} imagen${filesToSend.length === 1 ? "" : "es"}.`;

    const userMessage: Message = {
      role: "user",
      text: previewText,
    };

    setMessages((prev) => [...prev, userMessage]);
    setText("");
    setLoading(true);

    try {
      const form = new FormData();
      form.append("agentId", agentId);
      form.append("message", cleanText);

      filesToSend.forEach((file) => {
        form.append("images", file);
      });

      const token = localStorage.getItem("token") || "";

const res = await fetch(`${API}/run-agent`, {
  method: "POST",
  headers: token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : undefined,
  body: form,
});

      const response = await res.json();

      const assistantMessage: Message = {
        role: "assistant",
        text: response.reply || "Sin respuesta del agente.",
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setSelectedFiles([]);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch {
      const assistantMessage: Message = {
        role: "assistant",
        text: "Hubo un error ejecutando el agente.",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setLoading(false);
    }
  }

  function mergeFiles(newFiles: File[]) {
  setSelectedFiles((prev) => {
    const map = new Map<string, File>();

    [...prev, ...newFiles].forEach((file) => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      map.set(key, file);
    });

    return Array.from(map.values());
  });
}

useEffect(() => {
  if (!storageKey) return;

  try {
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setMessages(parsed);
      } else {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  } catch {
    setMessages([]);
  }
}, [storageKey]);

useEffect(() => {
  if (!storageKey) return;

  try {
    localStorage.setItem(storageKey, JSON.stringify(messages));
  } catch {}
}, [messages, storageKey]);

  return (
    <div
      style={{
        border: "1px solid #182235",
        borderRadius: 20,
        background: "linear-gradient(180deg, #0b1220 0%, #09101c 100%)",
        minHeight: 620,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        overflow: "hidden",
      }}
    >
      <div
  style={{
    padding: "18px 20px",
    borderBottom: "1px solid #182235",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  }}
>
  <div
    style={{
      fontWeight: 700,
      fontSize: 18,
    }}
  >
    Chat con {agentName}
  </div>

  <button
    type="button"
    onClick={() => {
      setMessages([]);
      if (storageKey) {
        localStorage.removeItem(storageKey);
      }
    }}
    style={{
      border: "1px solid #243041",
      background: "#0f172a",
      color: "#e5e7eb",
      borderRadius: 12,
      padding: "8px 12px",
      cursor: "pointer",
      fontSize: 13,
    }}
  >
    Limpiar chat
  </button>
</div>

      <div
        style={{
          flex: 1,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto",
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              color: "#94a3b8",
              fontSize: 15,
              padding: "8px 4px",
            }}
          >
            Escribí un mensaje para empezar a usar el agente.
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              alignSelf: message.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              padding: "12px 14px",
              borderRadius: 16,
              background: message.role === "user" ? "#2563eb" : "#111827",
              color: "white",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
              border: message.role === "user" ? "none" : "1px solid #1f2937",
            }}
          >
            {message.text}
          </div>
        ))}

        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "80%",
              padding: "12px 14px",
              borderRadius: 16,
              background: "#111827",
              color: "white",
              border: "1px solid #1f2937",
            }}
          >
            Pensando...
          </div>
        )}
      </div>

      <div
  onDragOver={(e) => {
    e.preventDefault();
    setIsDragging(true);
  }}
  onDragLeave={(e) => {
    e.preventDefault();
    setIsDragging(false);
  }}
  onDrop={(e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files || []).filter((file) =>
      file.type.startsWith("image/")
    );

    if (files.length > 0) {
      mergeFiles(files);
    }
  }}
  style={{
    borderTop: "1px solid #182235",
    padding: 16,
    background: isDragging ? "rgba(37,99,235,0.12)" : "rgba(3,7,18,0.55)",
  }}
>
        {selectedFiles.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 12,
            }}
          >
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 999,
                  background: "#111827",
                  border: "1px solid #243041",
                  fontSize: 13,
                  color: "#d1d5db",
                }}
              >
                <span>{file.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextFiles = selectedFiles.filter((_, i) => i !== index);
                    setSelectedFiles(nextFiles);

                    if (nextFiles.length === 0 && fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#93c5fd",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: 13,
                  }}
                >
                  quitar
                </button>
              </div>
            ))}
          </div>
        )}

        <div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 12,
    alignItems: "end",
  }}
  className="chat-input-grid"
>
          <div
            style={{
              border: "1px solid #243041",
              borderRadius: 16,
              background: "#030712",
              padding: 12,
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Escribí tu mensaje..."
              rows={3}
              style={{
                width: "100%",
                resize: "none",
                border: "none",
                background: "transparent",
                color: "white",
                outline: "none",
                fontSize: 15,
                lineHeight: 1.5,
                marginBottom: 10,
              }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: "1px solid #243041",
                    background: "#0f172a",
                    color: "#e5e7eb",
                    borderRadius: 12,
                    padding: "10px 14px",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  + Agregar fotos
                </button>

                <span style={{ color: "#94a3b8", fontSize: 13 }}>
  Arrastrá fotos acá · Enter envía · Shift + Enter baja de línea
</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
  const files = Array.from(e.target.files || []).filter((file) =>
    file.type.startsWith("image/")
  );
  mergeFiles(files);
}}
                style={{ display: "none" }}
              />
            </div>
          </div>

          <button
            onClick={() => handleSend()}
            disabled={loading}
            style={{
              height: 56,
              minWidth: 120,
              padding: "0 20px",
              borderRadius: 14,
              border: "none",
              background: loading ? "#374151" : "#2563eb",
              color: "white",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}