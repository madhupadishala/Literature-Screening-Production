"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSession, type ClinixSession } from "@/lib/session-manager";

const TENANTS = [
  { tenantId: "clinixai-prod", tenantName: "TheClinixAI Production" },
  { tenantId: "demo-tenant", tenantName: "Demo Tenant" },
  { tenantId: "uat-tenant", tenantName: "UAT Workspace" },
  { tenantId: "training-tenant", tenantName: "Training Workspace" },
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

function persistServerSession(
  server: ServerSession,
  input: {
    tenantName: string;
    environment: "PROD" | "UAT" | "TRAINING";
  },
) {
  const now = new Date().toISOString();
  const session: ClinixSession = {
    sessionId: server.id,
    organizationId: "ORG-CLINIXAI",
    organizationName: "ClinixAI",
    tenantId: server.user.tenantId,
    tenantName: input.tenantName,
    userId: server.user.id,
    userName: server.user.name,
    role: ROLE_LABELS[server.user.role] ?? server.user.role,
    environment: input.environment,
    permissions: server.user.permissions,
    loginTime: now,
    lastActivity: now,
    expiresAt: server.expiresAt,
    locked: false,
    accessToken: server.accessToken,
  };

  saveSession(session);
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [environment, setEnvironment] = useState<"PROD" | "UAT" | "TRAINING">("PROD");
  const [tenantId, setTenantId] = useState("clinixai-prod");
  const [loading, setLoading] = useState(false);
  const [reviewChecking, setReviewChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function enterControlledReviewWorkspace() {
      try {
        const response = await fetch("/api/auth/review-session", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
        });

        if (!response.ok) return;

        const data = await response.json();
        if (!data?.authenticated || !data?.reviewMode || !data?.session) return;

        persistServerSession(data.session as ServerSession, {
          tenantName: "Nexus RC1 UAT Review",
          environment: "UAT",
        });

        if (!cancelled) router.replace("/literature-search");
      } catch {
        // Normal authenticated login remains available when review mode is not
        // enabled or the preview review session cannot be established.
      } finally {
        if (!cancelled) setReviewChecking(false);
      }
    }

    void enterControlledReviewWorkspace();

    return () => {
      cancelled = true;
    };
  }, [router]);

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

      persistServerSession(server, {
        tenantName: tenant?.tenantName ?? server.user.tenantId,
        environment,
      });

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
          <p>Nexus Safety Platform</p>
        </div>

        {reviewChecking ? (
          <div className="review-access" role="status">
            Opening controlled Nexus UAT review workspace…
          </div>
        ) : null}

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

        <button onClick={login} disabled={loading || reviewChecking}>
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <p className="hint">
          Production and non-review environments require normal authenticated access.
        </p>
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

        .review-access {
          margin-bottom: 16px;
          border: 1px solid #a7f3d0;
          border-radius: 12px;
          background: #ecfdf5;
          color: #065f46;
          padding: 11px 12px;
          font-size: 12px;
          font-weight: 800;
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
