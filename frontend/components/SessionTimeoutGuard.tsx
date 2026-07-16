"use client";

import { useEffect, useState } from "react";
import {
  clearSession,
  getRemainingSessionMs,
  getSession,
  lockSession,
  refreshSessionActivity,
  WARNING_BEFORE_MS,
} from "@/lib/session-manager";

export default function SessionTimeoutGuard() {
  const [showWarning, setShowWarning] = useState(false);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    refreshSessionActivity();

    const activityEvents = ["mousemove", "keydown", "click", "scroll"];

    function handleActivity() {
      if (locked) return;
      refreshSessionActivity();
      setShowWarning(false);
      setCountdown(60);
    }

    activityEvents.forEach((event) => window.addEventListener(event, handleActivity));

    const interval = setInterval(() => {
      const remaining = getRemainingSessionMs();

      if (remaining <= WARNING_BEFORE_MS && remaining > 0) {
        setShowWarning(true);
        setCountdown(Math.max(1, Math.ceil(remaining / 1000)));
      }

      if (remaining <= 0) {
        const session = lockSession();
        auditSession("SESSION_LOCKED", "Idle timeout reached.");
        setLocked(true);
        setShowWarning(false);
        setCountdown(0);
      }
    }, 1000);

    return () => {
      activityEvents.forEach((event) => window.removeEventListener(event, handleActivity));
      clearInterval(interval);
    };
  }, [locked]);

  async function auditSession(action: string, reason: string) {
    const session = getSession();

    await fetch("/api/session/audit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
  }

  function continueSession() {
    refreshSessionActivity();
    auditSession("SESSION_CONTINUED", "User continued before timeout.");
    setShowWarning(false);
    setCountdown(60);
  }

  function unlockSession() {
    if (!password.trim()) return;

    refreshSessionActivity();
    auditSession("SESSION_UNLOCKED", "User unlocked session.");
    setLocked(false);
    setPassword("");
  }

  function logout() {
    auditSession("LOGOUT", "User logged out manually.");
    clearSession();
    window.location.href = "/";
  }

  if (locked) {
    const session = getSession();

    return (
      <div className="session-overlay">
        <div className="session-card">
          <h2>ClinixAI Session Locked</h2>
          <p>Your session was locked after 5 minutes of inactivity.</p>

          <div className="session-meta">
            <span>User</span>
            <strong>{session.userName}</strong>
          </div>

          <div className="session-meta">
            <span>Tenant</span>
            <strong>{session.tenantName}</strong>
          </div>

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password to unlock"
          />

          <div className="session-actions">
            <button onClick={unlockSession}>Unlock</button>
            <button className="secondary" onClick={logout}>
              Logout
            </button>
          </div>
        </div>

        <style jsx>{styles}</style>
      </div>
    );
  }

  if (showWarning) {
    return (
      <div className="session-warning">
        <strong>Session expires in {countdown}s</strong>
        <span>Continue working to keep your session active.</span>
        <button onClick={continueSession}>Continue Working</button>
        <button className="secondary" onClick={logout}>
          Logout
        </button>

        <style jsx>{styles}</style>
      </div>
    );
  }

  return null;
}

const styles = `
  .session-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.78);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .session-card {
    width: 420px;
    background: #ffffff;
    border-radius: 22px;
    padding: 28px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
  }

  .session-card h2 {
    margin: 0 0 8px;
    color: #0f172a;
  }

  .session-card p {
    margin: 0 0 18px;
    color: #64748b;
    line-height: 1.5;
  }

  .session-meta {
    display: flex;
    justify-content: space-between;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 10px;
  }

  .session-meta span {
    color: #64748b;
    font-weight: 800;
    font-size: 12px;
    text-transform: uppercase;
  }

  input {
    width: 100%;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    border-radius: 12px;
    padding: 12px 14px;
    margin: 12px 0;
    outline: none;
  }

  .session-actions {
    display: flex;
    gap: 10px;
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
`;