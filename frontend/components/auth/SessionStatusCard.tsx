"use client";

import { useState } from "react";
import { useDeferredLoad } from "@/hooks/use-deferred-load";
import type { SessionResponse } from "@/lib/auth/auth-types";

function formatDate(value?: string) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
}

export default function SessionStatusCard() {
  const [data, setData] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadSession() {
    setLoading(true);

    try {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
      });

      const result = (await response.json()) as SessionResponse;
      setData(result);
    } finally {
      setLoading(false);
    }
  }

  useDeferredLoad(loadSession);

  const session = data?.session;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Session Status</h2>
          <p className="text-sm text-slate-500">
            Production authentication diagnostics.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSession}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading session...</div>
      ) : !session ? (
        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          No active authenticated session found.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs uppercase text-slate-400">User</div>
            <div className="font-semibold text-slate-900">
              {session.user.name}
            </div>
            <div className="text-sm text-slate-500">{session.user.email}</div>
          </div>

          <div>
            <div className="text-xs uppercase text-slate-400">Tenant</div>
            <div className="font-semibold text-slate-900">
              {session.user.tenantId}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase text-slate-400">Role</div>
            <div className="font-semibold text-slate-900">
              {session.user.role}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase text-slate-400">Provider</div>
            <div className="font-semibold text-slate-900">
              {session.provider}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase text-slate-400">Status</div>
            <div className="font-semibold text-slate-900">
              {session.status}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase text-slate-400">Expires At</div>
            <div className="font-semibold text-slate-900">
              {formatDate(session.expiresAt)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
