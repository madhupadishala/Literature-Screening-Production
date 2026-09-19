"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearSession,
  getRemainingSessionMs,
  getSession,
  refreshSessionActivity,
  WARNING_BEFORE_MS,
} from "@/lib/session-manager";

export default function SessionTimeoutGuard() {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const endingSessionRef = useRef(false);

  useEffect(() => {
    if (!getSession()) return;

    refreshSessionActivity();

    const activityEvents = ["mousemove", "keydown", "click", "scroll"];

    function handleActivity() {
      if (endingSessionRef.current || !getSession()) return;
      refreshSessionActivity();
      setShowWarning(false);
      setCountdown(60);
    }

    async function expireForInactivity() {
      if (endingSessionRef.current) return;
      endingSessionRef.current = true;

      await auditSession("SESSION_EXPIRED", "Idle timeout reached.");
      await clearBackendSession();

      clearSession();
      window.location.href = "/login";
    }

    activityEvents.forEach((event) => window.addEventListener(event, handleActivity));

    const interval = window.setInterval(() => {
      if (endingSessionRef.current || !getSession()) return;

      const remaining = getRemainingSessionMs();

      if (remaining <= WARNING_BEFORE_MS && remaining > 0) {
        setShowWarning(true);
        setCountdown(Math.max(1, Math.ceil(remaining / 1000)));
      }

      if (remaining <= 0) {
        void expireForInactivity();
      }
    }, 1000);

    return () => {
      activityEvents.forEach((event) => window.removeEventListener(event, handleActivity));
      window.clearInterval(interval);
    };
  }, []);

  async function auditSession(action: string, reason: string) {
    const session = getSession();
    if (!session) return;

    try {
      await fetch("/api/session/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          action,
          reason,
          sessionId: session.sessionId,
          userName: session.userName,
          role: session.role,
          tenantId: session.tenantId,
          environment: session.environment,
        }),
      });
    } catch {
      // Session expiry/logout must continue even if audit delivery fails.
    }
  }

  async function clearBackendSession() {
    try {
      await fetch("/api/auth/session", {
        method: "DELETE",
        credentials: "same-origin",
      });
    } catch {
      // Local cleanup still proceeds if the backend is already unreachable/expired.
    }
  }

  async function continueSession() {
    if (endingSessionRef.current) return;

    try {
      const response = await fetch("/api/context/current", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        endingSessionRef.current = true;
        await auditSession(
          "SESSION_EXPIRED",
          "Backend authentication expired before local idle timeout.",
        );
        await clearBackendSession();
        clearSession();
        window.location.href = "/login";
        return;
      }

      refreshSessionActivity();
      await auditSession("SESSION_CONTINUED", "User continued before idle timeout.");
      setShowWarning(false);
      setCountdown(60);
    } catch {
      endingSessionRef.current = true;
      clearSession();
      window.location.href = "/login";
    }
  }

  async function logout() {
    if (endingSessionRef.current) return;
    endingSessionRef.current = true;

    await auditSession("LOGOUT", "User logged out manually.");
    await clearBackendSession();

    clearSession();
    window.location.href = "/login";
  }

  if (!showWarning) return null;

  return (
    <div className="session-warning">
      <strong>Session expires in {countdown}s</strong>
      <span>Continue working to keep your session active.</span>
      <button onClick={() => void continueSession()}>Continue Working</button>
      <button className="secondary" onClick={() => void logout()}>
        Logout
      </button>

      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .session-warning {
    position: fixed;
    right: 24px;
    bottom: 24px;
    background: #0f172a;
    color: #ffffff;
    border-radius: 18px;
    padding: 16px;
    box-shadow: 0 18px 45px rgba(15, 23, 42, 0.32);
    z-index: 9999;
    display: grid;
    gap: 8px;
    min-width: 320px;
  }

  .session-warning span {
    color: #cbd5e1;
    font-size: 13px;
  }

  button {
    border: none;
    border-radius: 12px;
    background: #185a9d;
    color: #ffffff;
    padding: 11px 14px;
    font-weight: 800;
    cursor: pointer;
  }

  button.secondary {
    background: #e2e8f0;
    color: #334155;
  }
`;
