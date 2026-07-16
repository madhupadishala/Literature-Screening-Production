export type ClinixSession = {
  sessionId: string;
  organizationId: string;
  organizationName: string;
  tenantId: string;
  tenantName: string;
  userId: string;
  userName: string;
  role: string;
  environment: "PROD" | "UAT" | "TRAINING";
  permissions: string[];
  loginTime: string;
  lastActivity: string;
  expiresAt: string;
  locked: boolean;
};

const SESSION_KEY = "clinixai_session";

export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const WARNING_BEFORE_MS = 60 * 1000;

export function createDemoSession(): ClinixSession {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + IDLE_TIMEOUT_MS);

  return {
    sessionId: `SES-${Date.now()}`,
    organizationId: "ORG-DEMO",
    organizationName: "ClinixAI Demo Organization",
    tenantId: "demo-tenant",
    tenantName: "Demo Tenant",
    userId: "USR-MADHU",
    userName: "Madhu",
    role: "Super User",
    environment: "PROD",
    permissions: [
      "dashboard.view",
      "workflow.view",
      "workflow.run",
      "package.assign",
      "package.unlock",
      "package.override",
      "package.route_back",
      "admin.view",
    ],
    loginTime: now.toISOString(),
    lastActivity: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    locked: false,
  };
}

export function getSession(): ClinixSession {
  if (typeof window === "undefined") return createDemoSession();

  const saved = window.localStorage.getItem(SESSION_KEY);

  if (!saved) {
    const session = createDemoSession();
    saveSession(session);
    return session;
  }

  return JSON.parse(saved);
}

export function saveSession(session: ClinixSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function refreshSessionActivity() {
  const session = getSession();
  const now = new Date();

  session.lastActivity = now.toISOString();
  session.expiresAt = new Date(now.getTime() + IDLE_TIMEOUT_MS).toISOString();
  session.locked = false;

  saveSession(session);
  return session;
}

export function lockSession() {
  const session = getSession();
  session.locked = true;
  saveSession(session);
  return session;
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

export function getRemainingSessionMs() {
  const session = getSession();
  return new Date(session.expiresAt).getTime() - Date.now();
}

export function hasPermission(permission: string) {
  const session = getSession();
  return session.permissions.includes(permission);
}