"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession } from "@/lib/session-manager";

const TENANTS = [
  { tenantId: "demo-tenant", tenantName: "Demo Tenant" },
  { tenantId: "novartis-prod", tenantName: "Novartis Workspace" },
  { tenantId: "uat-tenant", tenantName: "UAT Workspace" },
  { tenantId: "training-tenant", tenantName: "Training Workspace" },
];

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("super.user");
  const [password, setPassword] = useState("password");
  const [environment, setEnvironment] = useState<"PROD" | "UAT" | "TRAINING">("PROD");
  const [tenantId, setTenantId] = useState("demo-tenant");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/session/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          environment,
          tenantId,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Login failed.");
        return;
      }

      saveSession(data.session);
      router.push("/");
    } catch {
      setError("Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-block">
          <h1>ClinixAI</h1>
          <p>Literature Screening V1</p>
        </div>

        <div className="form-grid">
          <label>
            Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label>
            Environment
            <select
              value={environment}
              onChange={(event) =>
                setEnvironment(event.target.value as "PROD" | "UAT" | "TRAINING")
              }
            >
              <option>PROD</option>
              <option>UAT</option>
              <option>TRAINING</option>
            </select>
          </label>

          <label>
            Tenant
            <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
              {TENANTS.map((tenant) => (
                <option key={tenant.tenantId} value={tenant.tenantId}>
                  {tenant.tenantName}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <div className="error">{error}</div>}

        <button onClick={login} disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <p className="hint">Username + password + environment + tenant are mandatory.</p>
      </section>

      <style jsx>{`
        .login-shell {
          min-height: 100vh;
          background: linear-gradient(135deg, #071b34, #123f68);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          font-family: Arial, Helvetica, sans-serif;
        }

        .login-card {
          width: 460px;
          background: #ffffff;
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.32);
        }

        .brand-block {
          margin-bottom: 24px;
        }

        h1 {
          margin: 0;
          color: #071b34;
          font-size: 36px;
        }

        p {
          margin: 8px 0 0;
          color: #64748b;
        }

        .form-grid {
          display: grid;
          gap: 14px;
        }

        label {
          display: grid;
          gap: 8px;
          color: #475569;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }

        input,
        select {
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 14px;
          outline: none;
          background: #f8fafc;
        }

        button {
          margin-top: 20px;
          width: 100%;
          border: none;
          border-radius: 14px;
          background: #185a9d;
          color: white;
          padding: 13px 16px;
          font-weight: 900;
          cursor: pointer;
          font-size: 15px;
        }

        button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .error {
          margin-top: 14px;
          background: #fee2e2;
          color: #991b1b;
          padding: 12px;
          border-radius: 12px;
          font-weight: 800;
        }

        .hint {
          text-align: center;
          font-size: 12px;
          margin-top: 14px;
        }
      `}</style>
    </main>
  );
}