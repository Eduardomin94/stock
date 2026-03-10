"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const ADMIN_EMAIL = String(process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").trim().toLowerCase();

const inputStyle: React.CSSProperties = {
  height: 46,
  borderRadius: 12,
  border: "1px solid #243041",
  background: "#030712",
  color: "white",
  padding: "0 14px",
  outline: "none",
};

export default function AdminUsersPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userRaw = localStorage.getItem("user");

    if (!token || !userRaw) {
      router.push("/login");
      return;
    }

    try {
      const user = JSON.parse(userRaw);
      const email = String(user?.email || "").trim().toLowerCase();

      if (!email || email !== ADMIN_EMAIL) {
        router.push("/");
        return;
      }

      setIsAdmin(true);
    } catch {
      router.push("/");
      return;
    } finally {
      setChecking(false);
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const token = localStorage.getItem("token");
    if (!token) {
      setError("No hay sesión iniciada");
      return;
    }

    setLoading(true);
    setError("");
    setOk("");

    try {
      const res = await fetch(`${API}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          password,
          store_url: storeUrl,
          consumer_key: consumerKey,
          consumer_secret: consumerSecret,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "No se pudo crear el usuario");
      }

      setOk("Usuario creado correctamente");
      setEmail("");
      setPassword("");
      setStoreUrl("");
      setConsumerKey("");
      setConsumerSecret("");
    } catch (err: any) {
      setError(err.message || "Error al crear usuario");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#030712", color: "white" }}>Verificando acceso...</main>;
  }

  if (!isAdmin) return null;

  return (
    <main style={{ minHeight: "100vh", background: "#030712", color: "white", padding: 24 }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700 }}>Crear usuario</h1>
            <p style={{ marginTop: 8, color: "#94a3b8" }}>Panel privado para darte de alta clientes manualmente.</p>
          </div>

          <button
            onClick={() => router.push("/")}
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
            Volver
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ background: "#0b1220", border: "1px solid #182235", borderRadius: 20, padding: 24, display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={inputStyle} />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <label>Contraseña</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="text" required style={inputStyle} />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <label>Store URL</label>
            <input value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} type="text" required style={inputStyle} />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <label>Consumer Key</label>
            <input value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} type="text" required style={inputStyle} />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <label>Consumer Secret</label>
            <input value={consumerSecret} onChange={(e) => setConsumerSecret(e.target.value)} type="text" required style={inputStyle} />
          </div>

          {error ? <div style={{ color: "#fca5a5" }}>{error}</div> : null}
          {ok ? <div style={{ color: "#86efac" }}>{ok}</div> : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              height: 48,
              borderRadius: 12,
              border: "none",
              background: loading ? "#374151" : "#2563eb",
              color: "white",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creando..." : "Crear usuario"}
          </button>
        </form>
      </div>
    </main>
  );
}