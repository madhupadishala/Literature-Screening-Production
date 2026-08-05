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
  accessToken?: string;
};

const SESSION_KEY = "clinixai_session";

export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const WARNING_BEFORE_MS = 60 * 1000;

// A session is only ever created here from a server response after a real
// login (see app/login/page.tsx -> POST /api/auth/session). This module
// used to silently fabricate a full Super User session on first load with
// no login at all -- that fallback has been removed. getSession() now
// returns null when nothing has been saved, and callers are responsible
// for redirecting to /login.
export function getSession(): ClinixSession | null {
  if (typeof window === "undefined") return null;

  const saved = window.localStorage.getItem(SESSION_KEY);
  if (!saved) return null;

  try {
    return JSON.parse(saved) as ClinixSession;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  const session = getSession();
  if (!session) return false;
  if (session.locked) return false;
  return new Date(session.expiresAt).getTime() > Date.now();
}

export function saveSession(session: ClinixSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function refreshSessionActivity() {
  const session = getSession();
  if (!session) return null;

  const now = new Date();

  session.lastActivity = now.toISOString();
  session.expiresAt = new Date(now.getTime() + IDLE_TIMEOUT_MS).toISOString();
  session.locked = false;

  saveSession(session);
  return session;
}

export function lockSession() {
  const session = getSession();
  if (!session) return null;

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
  if (!session) return 0;
  return new Date(session.expiresAt).getTime() - Date.now();
}

export function hasPermission(permission: string) {
  const session = getSession();
  if (!session) return false;
  return session.permissions.includes(permission);
}
