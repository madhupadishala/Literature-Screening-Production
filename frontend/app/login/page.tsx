"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession, type ClinixSession } from "@/lib/session-manager";

const TENANTS = [
  {
    tenantId: "clinixai-internal-validation",
    tenantName: "ClinixAI Internal PV Validation",
  },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  client_admin: "Client Admin",
  super_user: "Super User",
  qc: "QC Reviewer",
  auditor: "Auditor",
  read_only: "Read Only",
};

type ServerSession = {
  id: string;
  accessToken: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    tenantId: string;
    role: string;
    permissions: string[];
  };
};

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [environment] = useState<"VALIDATION">("VALIDATION");
  const [tenantId] = useState("clinixai-internal-validation");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const demoMode = process.env.NEXT_PUBLIC_VALIDATION_DEMO_MODE === "true";

  function continueInDemoMode() {
    const now = new Date();
    const session: ClinixSession = {
      sessionId: `validation-demo-${now.getTime()}`,
      organizationId: "ORG-CLINIXAI-VALIDATION",
      organizationName: "ClinixAI",
      tenantId,
      tenantName: "ClinixAI Internal PV Validation",
      userId: "validation-demo-user",
      userName: "ClinixAI Validation Demo",
      role: "PV Validation Demo",
      environment,
      permissions: ["review:read", "review:write", "reports:read"],
      loginTime: now.toISOString(),
      lastActivity: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      locked: false,
    };

    saveSession(session);
    router.push("/");
  }

  async function login() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, tenantId }),
      });

      const data = await response.json();

      if (!response.ok || !data.authenticated) {
        setError(data.error || "Login failed.");
        return;
      }

      const server = data.session as ServerSession;
      const tenant = TENANTS.find((item) => item.tenantId === tenantId);
      const now = new Date().toISOString();

      const session: ClinixSession = {
        sessionId: server.id,
        organizationId: "ORG-CLINIXAI",
        organizationName: "ClinixAI",
        tenantId: server.user.tenantId,
        tenantName: tenant?.tenantName ?? server.user.tenantId,
        userId: server.user.id,
        userName: server.user.name,
        role: ROLE_LABELS[server.user.role] ?? server.user.role,
        environment,
        permissions: server.user.permissions,
        loginTime: now,
        lastActivity: now,
        expiresAt: server.expiresAt,
        locked: false,
        // Signed server token (HMAC, see lib/auth/token-service.ts). API
        // calls that need to authenticate should send this as
        // `Authorization: Bearer <accessToken>`. It is not yet wired into
        // every API client call in this codebase -- that's a follow-up,
        // not something this session object claims to solve on its own.
        accessToken: server.accessToken,
      };

      saveSession(session);
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
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
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
            <input value="VALIDATION" readOnly />
          </label>

          <label>
            Tenant
            <select value={tenantId} disabled>
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

        {demoMode && (
          <>
            <div className="demo-warning">
              DEMO MODE — PUBLIC, SYNTHETIC OR DE-IDENTIFIED DATA ONLY
            </div>
            <button className="demo-button" onClick={continueInDemoMode}>
              Continue to Temporary Demo
            </button>
          </>
        )}

        <p className="hint">Email + password + environment + tenant are mandatory.</p>
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

        .demo-warning {
          margin-top: 18px;
          border: 1px solid #f59e0b;
          background: #fffbeb;
          color: #92400e;
          padding: 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 900;
          text-align: center;
        }

        button.demo-button {
          margin-top: 10px;
          background: #92400e;
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
