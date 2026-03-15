"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ChatWindow from "@/components/ChatWindow";

export default function Page() {
  const router = useRouter();

  const [authChecking, setAuthChecking] = useState(true);
  const [userEmail, setUserEmail] = useState("");

  const isAdmin =
    userEmail.trim().toLowerCase() ===
    String(process.env.NEXT_PUBLIC_ADMIN_EMAIL || "")
      .trim()
      .toLowerCase();

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

    const userRaw = localStorage.getItem("user");

    if (userRaw) {
      try {
        const user = JSON.parse(userRaw);
        setUserEmail(user.email || "");
      } catch {}
    }

    setAuthChecking(false);
  }, [router]);

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
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {isAdmin && (
              <button
                onClick={() => router.push("/admin/users")}
                style={buttonStyle}
              >
                Crear usuarios
              </button>
            )}

            <button onClick={handleLogout} style={logoutButtonStyle}>
              Cerrar sesión
            </button>
          </div>
        </div>

        <ChatWindow />
      </div>
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  height: 44,
  padding: "0 16px",
  borderRadius: 12,
  border: "1px solid #243041",
  background: "#111827",
  color: "white",
  cursor: "pointer",
};

const logoutButtonStyle: React.CSSProperties = {
  height: 44,
  padding: "0 16px",
  borderRadius: 12,
  border: "1px solid #243041",
  background: "#0b1220",
  color: "white",
  cursor: "pointer",
};