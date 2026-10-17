"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clearSession, saveSession } from "@/lib/session-manager";
import { NEXUS_MODULE_DEFINITIONS, type NexusModuleKey } from "@/lib/nexus/modules";
import type { NexusEnvironment } from "@/lib/nexus/entitlement-types";
import styles from "./page.module.css";

type Identity = { sessionId: string; userId: string; email: string; displayName: string; expiresAt: string };
type Tenant = { tenantId: string; tenantKey: string; displayName: string; roleKey: string };
type Workspace = { workspaceId: string; displayName: string; modules: { moduleKey: NexusModuleKey }[] };
type EnvironmentAccess = { environment: NexusEnvironment; workspaces: Workspace[] };
async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload as T;
}
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [access, setAccess] = useState<EnvironmentAccess[]>([]);
  const [environment, setEnvironment] = useState<NexusEnvironment | "">("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [moduleKey, setModuleKey] = useState<NexusModuleKey | "">("");
  const [busy, setBusy] = useState(true);
  const [loadingScope, setLoadingScope] = useState(false);
  const [error, setError] = useState("");
  const scopeGeneration = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/identity", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (response.status === 401) return;
        const data = await readResponse<{ identity: Identity; tenants: Tenant[] }>(response);
        if (!controller.signal.aborted) { setIdentity(data.identity); setTenants(data.tenants); }
      })
      .catch(caught => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Session unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!identity || !tenantId) return;
    const generation = scopeGeneration.current;
    const controller = new AbortController();
    void fetch(`/api/nexus/context?tenantId=${encodeURIComponent(tenantId)}`, { cache: "no-store", signal: controller.signal })
      .then(readResponse<{ data: { environments: EnvironmentAccess[] } }>)
      .then(data => { if (!controller.signal.aborted && generation === scopeGeneration.current) setAccess(data.data.environments); })
      .catch(caught => { if (!controller.signal.aborted && generation === scopeGeneration.current) setError(caught instanceof Error ? caught.message : "Workspace access unavailable."); })
      .finally(() => { if (!controller.signal.aborted && generation === scopeGeneration.current) setLoadingScope(false); });
    return () => controller.abort();
  }, [identity, tenantId]);
  function changeTenant(value: string) {
    scopeGeneration.current += 1;
    setTenantId(value); setAccess([]); setEnvironment(""); setWorkspaceId(""); setModuleKey("");
    setLoadingScope(Boolean(value)); setError("");
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); clearSession();
    try {
      const data = await readResponse<{ identity: Identity; tenants: Tenant[] }>(await fetch("/api/auth/identity", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
      }));
      setIdentity(data.identity); setTenants(data.tenants); setPassword("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Authentication failed."); }
    finally { setBusy(false); }
  }
  const workspaces = access.find(item => item.environment === environment)?.workspaces ?? [];
  const modules = workspaces.find(item => item.workspaceId === workspaceId)?.modules ?? [];
  async function enterWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!identity || !environment) return;
    setBusy(true); setError(""); clearSession();
    try {
      const result = await readResponse<{ data: { permissions: string[] } }>(await fetch("/api/nexus/context", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, workspaceId, environment, moduleKey }),
      }));
      const tenant = tenants.find(item => item.tenantId === tenantId)!;
      const now = new Date().toISOString();
      saveSession({
        sessionId: identity.sessionId, organizationId: tenant.tenantId, organizationName: tenant.displayName,
        tenantId, tenantName: tenant.displayName, userId: identity.userId, userName: identity.displayName,
        role: tenant.roleKey, environment, permissions: result.data.permissions, workspaceId,
        workspaceName: workspaces.find(item => item.workspaceId === workspaceId)?.displayName, moduleKey,
        loginTime: now, lastActivity: now, expiresAt: identity.expiresAt, locked: false,
      });
      router.replace("/"); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Context selection failed."); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError("");
    try {
      await readResponse(await fetch("/api/auth/identity", { method: "DELETE" }));
      clearSession(); setIdentity(null); setTenants([]); changeTenant("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Sign out failed."); }
    finally { setBusy(false); }
  }
  return (
    <main className={styles.shell}><section className={styles.panel} aria-labelledby="login-title">
      <header className={styles.header}><h1 id="login-title">Nexus</h1><span>{identity ? identity.email : "Sign in"}</span></header>
      {identity ? <form onSubmit={enterWorkspace} className={styles.form}>
        <label>Tenant<select required value={tenantId} disabled={busy} onChange={event => changeTenant(event.target.value)}>
          <option value="">Select tenant</option>{tenants.map(tenant => <option key={tenant.tenantId} value={tenant.tenantId}>{tenant.displayName}</option>)}
        </select></label>
        <label>Environment<select required value={environment} disabled={busy || loadingScope || !tenantId} onChange={event => { setEnvironment(event.target.value as NexusEnvironment | ""); setWorkspaceId(""); setModuleKey(""); }}>
          <option value="">Select environment</option>{access.map(item => <option key={item.environment}>{item.environment}</option>)}
        </select></label>
        <label>Client workspace<select required value={workspaceId} disabled={busy || !environment} onChange={event => { setWorkspaceId(event.target.value); setModuleKey(""); }}>
          <option value="">Select client workspace</option>{workspaces.map(workspace => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.displayName}</option>)}
        </select></label>
        <label>Module<select required value={moduleKey} disabled={busy || !workspaceId} onChange={event => setModuleKey(event.target.value as NexusModuleKey | "")}>
          <option value="">Select module</option>{modules.map(module => <option key={module.moduleKey} value={module.moduleKey}>{NEXUS_MODULE_DEFINITIONS[module.moduleKey].label}</option>)}
        </select></label>
        {!tenants.length ? <p role="status">No active tenant memberships are assigned.</p> : null}
        {loadingScope ? <p role="status">Loading authorized workspaces…</p> : tenantId && !access.length ? <p role="status">No authorized workspace modules are available.</p> : null}
        <button disabled={busy || loadingScope || !moduleKey} type="submit">{busy ? "Opening…" : "Open workspace"}</button>
        <button className={styles.secondary} disabled={busy} type="button" onClick={signOut}>Sign out</button>
      </form> : <form onSubmit={authenticate} className={styles.form}>
        <label>Email<input required type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /></label>
        <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label>
        <button type="submit" disabled={busy}>{busy ? "Checking session…" : "Sign in"}</button>
      </form>}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section></main>
  );
}
