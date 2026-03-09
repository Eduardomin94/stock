"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const res = await fetch("http://localhost:3001/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "No se pudo iniciar sesión");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      router.push("/");
    } catch (err: any) {
      setError(err.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#030712",
        padding: 24,
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#0b1220",
          border: "1px solid #182235",
          borderRadius: 20,
          padding: 24,
          color: "white",
          display: "grid",
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            Iniciar sesión
          </h1>

          <p
            style={{
              marginTop: 8,
              marginBottom: 0,
              color: "#94a3b8",
            }}
          >
            Entrá a tu asistente WooCommerce.
          </p>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@tienda.com"
            required
            style={{
              height: 46,
              borderRadius: 12,
              border: "1px solid #243041",
              background: "#030712",
              color: "white",
              padding: "0 14px",
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={{
              height: 46,
              borderRadius: 12,
              border: "1px solid #243041",
              background: "#030712",
              color: "white",
              padding: "0 14px",
              outline: "none",
            }}
          />
        </div>

        {error && (
          <div
            style={{
              color: "#fca5a5",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            height: 48,
            borderRadius: 12,
            border: "none",
            background: loading ? "#374151" : "#2563eb",
            color: "white",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}