"use client";

import { useCallback, useEffect, useState } from "react";
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

type RuntimeConfig = {
  environment: "PROD" | "UAT" | "TRAINING";
  defaultTenantKey: string;
  preview: boolean;
};

type IdentityLoginResponse = {
  authenticated: boolean;
  tenants?: Array<{
    tenantId: string;
    tenantKey: string;
    displayName: string;
    roleKey: string;
  }>;
  error?: string;
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

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      response.ok
        ? "The login service returned an empty response."
        : "The UAT login service is temporarily unavailable.",
    );
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      response.ok
        ? "The login service returned an invalid response."
        : "The UAT login service is temporarily unavailable.",
    );
  }
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [environment, setEnvironment] = useState<"PROD" | "UAT" | "TRAINING">("PROD");
  const [tenantId, setTenantId] = useState("clinixai-prod");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewRuntime, setPreviewRuntime] = useState(false);

  const completeLogin = useCallback(async (response: Response, requestedTenantId: string, requestedEnvironment: "PROD" | "UAT" | "TRAINING") => {
    const data = await readJsonResponse(response);

    if (!response.ok || !data.authenticated) {
      throw new Error(data.error || "Login failed.");
    }

    const server = data.session as ServerSession;
    const tenant = TENANTS.find((item) => item.tenantId === requestedTenantId);
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
      environment: requestedEnvironment,
      permissions: server.user.permissions,
      loginTime: now,
      lastActivity: now,
      expiresAt: server.expiresAt,
      locked: false,
      accessToken: server.accessToken,
    };

    saveSession(session);
    router.push("/");
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    const loadRuntimeConfig = async () => {
      try {
        const response = await fetch("/api/runtime-config", { cache: "no-store" });
        if (!response.ok) return;
        const config = (await response.json()) as RuntimeConfig;
        if (cancelled) return;
        setEnvironment(config.environment);
        setTenantId(config.defaultTenantKey);
        setPreviewRuntime(config.preview);
      } catch {
        // Server remains authoritative; login will fail closed if scope is invalid.
      }
    };

    void loadRuntimeConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const localBypassEnabled =
      process.env.NEXT_PUBLIC_LOCAL_AUTH_BYPASS?.trim().toLowerCase() === "true";
    if (!localBypassEnabled) return;
    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      return;
    }

    const runLocalBypass = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: "demo-tenant" }),
        });
        await completeLogin(response, "demo-tenant", "UAT");
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Local bypass failed.");
        setLoading(false);
      }
    };

    void runLocalBypass();
  }, [completeLogin]);

  async function establishPreviewIdentityContext() {
    const identityResponse = await fetch("/api/auth/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const identity = (await readJsonResponse(identityResponse)) as unknown as IdentityLoginResponse;
    if (!identityResponse.ok || !identity.authenticated) {
      throw new Error(identity.error || "Identity authentication failed.");
    }

    const tenant = identity.tenants?.find((item) => item.tenantKey === tenantId);
    if (!tenant) {
      throw new Error("The authenticated identity has no access to the UAT tenant.");
    }

    const workspaceResponse = await fetch(
      `/api/nexus/context?tenantId=${encodeURIComponent(tenant.tenantId)}&environment=${environment}`,
      { cache: "no-store" },
    );
    const workspacePayload = await readJsonResponse(workspaceResponse);
    if (!workspaceResponse.ok || !workspacePayload?.success) {
      throw new Error(workspacePayload?.error || "UAT workspace context could not be loaded.");
    }

    const workspaces = Array.isArray(workspacePayload?.data?.workspaces)
      ? workspacePayload.data.workspaces
      : [];
    const workspace =
      workspaces.find((item: { modules?: Array<{ moduleKey?: string }> }) =>
        item.modules?.some((module) => module.moduleKey === "LITERATURE"),
      ) ?? workspaces[0];
    if (!workspace) {
      throw new Error("No authorized UAT workspace is available.");
    }

    const moduleKey =
      workspace.modules?.find((module: { moduleKey?: string }) => module.moduleKey === "LITERATURE")
        ?.moduleKey ?? workspace.modules?.[0]?.moduleKey;
    if (!moduleKey) {
      throw new Error("No authorized UAT module is available.");
    }

    const contextResponse = await fetch("/api/nexus/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: tenant.tenantId,
        workspaceId: workspace.workspaceId,
        environment,
        moduleKey,
        reason: "Authenticated preview user selected the governed UAT workspace context.",
      }),
    });
    const contextPayload = await readJsonResponse(contextResponse);
    if (!contextResponse.ok || !contextPayload?.success) {
      throw new Error(contextPayload?.error || "UAT workspace context selection failed.");
    }
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

      if (response.ok && previewRuntime) {
        try {
          await establishPreviewIdentityContext();
        } catch (contextError) {
          await fetch("/api/auth/identity", { method: "DELETE" }).catch(() => undefined);
          await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
          throw contextError;
        }
      }

      await completeLogin(response, tenantId, environment);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Login failed.");
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
            <select
              value={environment}
              disabled={previewRuntime}
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
            <select
              value={tenantId}
              disabled={previewRuntime}
              onChange={(event) => setTenantId(event.target.value)}
            >
              {(previewRuntime
                ? TENANTS.filter((tenant) => tenant.tenantId === "uat-tenant")
                : TENANTS
              ).map((tenant) => (
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

        <p className="hint">
          {previewRuntime
            ? "Preview deployment · UAT environment and tenant are enforced."
            : "Email + password + environment + tenant are mandatory."}
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
