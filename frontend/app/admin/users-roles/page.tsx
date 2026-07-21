"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";
import type { TenantAccessRecord } from "@/lib/rbac/access-governance-types";

type Editor = {
  userId?: string;
  email: string;
  displayName: string;
  roleKey: string;
  customPermissions: string[];
  membershipStatus: "active" | "disabled";
  expectedVersion?: number;
  reason: string;
};

const emptyEditor: Editor = {
  email: "",
  displayName: "",
  roleKey: "LITERATURE_REVIEWER",
  customPermissions: [],
  membershipStatus: "active",
  reason: "",
};

export default function UsersRolesPage() {
  const [records, setRecords] = useState<TenantAccessRecord[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissionOptions, setPermissionOptions] = useState<string[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/access", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success)
        throw new Error(payload?.error || "Access governance could not be loaded.");
      setRecords(payload.data.records);
      setRoles(payload.data.roles);
      setPermissionOptions(payload.data.permissions);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Access governance could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const request = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(request);
  }, [load]);

  const activeCount = useMemo(
    () => records.filter((record) => record.membershipStatus === "active").length,
    [records],
  );

  function edit(record: TenantAccessRecord) {
    setEditor({
      userId: record.userId,
      email: record.email,
      displayName: record.displayName,
      roleKey: record.roleKey,
      customPermissions: record.customPermissions,
      membershipStatus: record.membershipStatus,
      expectedVersion: record.membershipVersion,
      reason: "",
    });
  }

  async function save() {
    if (!editor) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success)
        throw new Error(payload?.error || "Access change failed.");
      setEditor(null);
      setMessage("Tenant access change saved and recorded in the immutable audit trail.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Access change failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="ENTERPRISE SECURITY"
        title="Users & Role-Based Access"
        subtitle="Govern tenant memberships using database-authoritative roles, controlled custom grants, optimistic concurrency, and immutable change history."
        status="RBAC Enforced"
      />

      <section className="metrics">
        <Metric label="Tenant Members" value={records.length} />
        <Metric label="Active Memberships" value={activeCount} />
        <Metric label="Disabled Memberships" value={records.length - activeCount} />
        <Metric label="Governed Roles" value={roles.length} />
      </section>

      {message && (
        <div className="message" role="status">
          {message}
        </div>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <span>Tenant access directory</span>
            <h2>Memberships</h2>
            <p>
              Request headers never determine roles. Every effective role comes from this governed
              tenant membership.
            </p>
          </div>
          <button type="button" onClick={() => setEditor({ ...emptyEditor })}>
            Add Tenant Member
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Custom Grants</th>
                <th>Status</th>
                <th>Version</th>
                <th>Last Changed</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.userId}>
                  <td>
                    <strong>{record.displayName}</strong>
                    <small>{record.email}</small>
                  </td>
                  <td>{record.roleKey}</td>
                  <td>
                    {record.customPermissions.length ? record.customPermissions.length : "None"}
                  </td>
                  <td>
                    <span className={record.membershipStatus}>{record.membershipStatus}</span>
                  </td>
                  <td>v{record.membershipVersion}</td>
                  <td>
                    <strong>{new Date(record.updatedAt).toLocaleString()}</strong>
                    <small>{record.updatedBy || "System"}</small>
                  </td>
                  <td>
                    <button type="button" className="secondary" onClick={() => edit(record)}>
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !records.length && (
                <tr>
                  <td className="empty" colSpan={7}>
                    No tenant memberships found.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td className="empty" colSpan={7}>
                    Loading governed memberships…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editor && (
        <div className="backdrop">
          <section
            className="editor"
            role="dialog"
            aria-modal="true"
            aria-label="Tenant membership editor"
          >
            <header>
              <div>
                <span>Controlled access change</span>
                <h2>{editor.userId ? "Manage Membership" : "Add Tenant Member"}</h2>
              </div>
              <button type="button" className="close" onClick={() => setEditor(null)}>
                ×
              </button>
            </header>
            <div className="form-grid">
              <label>
                Display Name
                <input
                  disabled={Boolean(editor.userId)}
                  value={editor.displayName}
                  onChange={(event) => setEditor({ ...editor, displayName: event.target.value })}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  disabled={Boolean(editor.userId)}
                  value={editor.email}
                  onChange={(event) => setEditor({ ...editor, email: event.target.value })}
                />
              </label>
              <label>
                Role
                <select
                  value={editor.roleKey}
                  onChange={(event) => setEditor({ ...editor, roleKey: event.target.value })}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Membership Status
                <select
                  value={editor.membershipStatus}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      membershipStatus: event.target.value as "active" | "disabled",
                    })
                  }
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
              <fieldset>
                <legend>Controlled custom permission grants</legend>
                <div className="permission-grid">
                  {permissionOptions.map((permission) => (
                    <label className="check" key={permission}>
                      <input
                        type="checkbox"
                        checked={editor.customPermissions.includes(permission)}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            customPermissions: event.target.checked
                              ? [...editor.customPermissions, permission]
                              : editor.customPermissions.filter((item) => item !== permission),
                          })
                        }
                      />
                      {permission}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="reason">
                Mandatory Change Reason
                <textarea
                  value={editor.reason}
                  onChange={(event) => setEditor({ ...editor, reason: event.target.value })}
                  placeholder="Explain the business and authorization basis for this access change."
                />
              </label>
            </div>
            <footer>
              <button type="button" className="secondary" onClick={() => setEditor(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || editor.reason.trim().length < 10}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save Governed Access"}
              </button>
            </footer>
          </section>
        </div>
      )}

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          padding: 24px;
          color: #0f172a;
          background: #eef2f7;
          font-family: "Poppins", Arial, sans-serif;
        }
        .metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 14px;
        }
        .panel {
          overflow: hidden;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #fff;
          box-shadow: 0 5px 18px rgba(15, 23, 42, 0.06);
        }
        .panel-header {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #e2e8f0;
        }
        .panel-header span,
        header span {
          color: #185abd;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }
        h2 {
          margin: 5px 0;
          font-size: 20px;
        }
        p {
          margin: 0;
          color: #64748b;
          font-size: 10px;
        }
        button {
          border: 0;
          border-radius: 6px;
          padding: 10px 13px;
          color: #fff;
          background: #185abd;
          font: inherit;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .secondary {
          border: 1px solid #cbd5e1;
          color: #334155;
          background: #fff;
        }
        .table-wrap {
          overflow-x: auto;
        }
        table {
          width: 100%;
          min-width: 1050px;
          border-collapse: collapse;
        }
        th,
        td {
          padding: 13px 15px;
          border-bottom: 1px solid #e8eef5;
          text-align: left;
          font-size: 10px;
        }
        th {
          color: #64748b;
          background: #f8fafc;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        td strong,
        td small {
          display: block;
        }
        td small {
          margin-top: 4px;
          color: #64748b;
        }
        .active,
        .disabled {
          display: inline-flex;
          padding: 5px 8px;
          border-radius: 999px;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .active {
          color: #166534;
          background: #dcfce7;
        }
        .disabled {
          color: #991b1b;
          background: #fee2e2;
        }
        .empty {
          padding: 32px;
          color: #64748b;
          text-align: center;
        }
        .message {
          margin-bottom: 14px;
          padding: 12px 14px;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          color: #1e40af;
          background: #eff6ff;
          font-size: 11px;
          font-weight: 700;
        }
        .backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(15, 23, 42, 0.58);
        }
        .editor {
          width: min(900px, 100%);
          max-height: 92vh;
          overflow-y: auto;
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 28px 80px rgba(15, 23, 42, 0.3);
        }
        .editor header,
        .editor footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 18px 20px;
          border-bottom: 1px solid #e2e8f0;
        }
        .editor footer {
          justify-content: flex-end;
          border-top: 1px solid #e2e8f0;
          border-bottom: 0;
        }
        .close {
          color: #475569;
          background: transparent;
          font-size: 22px;
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          padding: 20px;
        }
        label {
          display: grid;
          gap: 7px;
          color: #475569;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
        }
        input,
        select,
        textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #fff;
          font: inherit;
          font-size: 11px;
        }
        textarea {
          min-height: 90px;
          resize: vertical;
        }
        fieldset,
        .reason {
          grid-column: 1 / -1;
        }
        fieldset {
          padding: 14px;
          border: 1px solid #dbe4ef;
          border-radius: 6px;
        }
        legend {
          color: #475569;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .permission-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .check {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 7px;
          border: 1px solid #e2e8f0;
          border-radius: 5px;
          font-size: 8px;
          text-transform: none;
          word-break: break-word;
        }
        .check input {
          width: auto;
        }
        @media (max-width: 800px) {
          .app-shell {
            padding: 12px;
          }
          .metrics {
            grid-template-columns: 1fr 1fr;
          }
          .form-grid {
            grid-template-columns: 1fr;
          }
          .permission-grid {
            grid-template-columns: 1fr;
          }
          fieldset,
          .reason {
            grid-column: auto;
          }
        }
      `}</style>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <style jsx>{`
        .metric {
          padding: 15px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #fff;
        }
        span {
          display: block;
          color: #64748b;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
        }
        strong {
          display: block;
          margin-top: 8px;
          color: #185abd;
          font-size: 22px;
        }
      `}</style>
    </article>
  );
}
