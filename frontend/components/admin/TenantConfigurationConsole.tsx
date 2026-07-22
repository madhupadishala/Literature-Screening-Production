"use client";

import { useMemo, useState } from "react";

import { useDeferredLoad } from "@/hooks/use-deferred-load";

type ResourceType =
  | "PRODUCT_MASTER"
  | "LITERATURE_CALENDAR"
  | "CLIENT_GUIDELINE"
  | "OUTCOME_TEMPLATE"
  | "LITERATURE_SOURCE";

type Version = {
  id: string;
  resourceType: ResourceType;
  configKey: string;
  displayName: string;
  versionNumber: number;
  versionLabel: string;
  lifecycleStatus: string;
  effectiveFrom: string | null;
  sourceFilename: string | null;
  validationReport: {
    valid?: boolean;
    errors?: Array<{ path: string; message: string }>;
    warnings?: Array<{ path: string; message: string }>;
  };
  createdAt: string;
};

type Permissions = {
  upload: boolean;
  create: boolean;
  validate: boolean;
  approve: boolean;
  activate: boolean;
  retire: boolean;
  manageSources: boolean;
};

type Source = {
  sourceKey: string;
  displayName: string;
  connectorType: string;
  enabled: boolean;
  maxResults: number;
  settings: Record<string, unknown>;
};

const RESOURCE_TABS: Array<{
  type: ResourceType;
  label: string;
  description: string;
}> = [
  {
    type: "PRODUCT_MASTER",
    label: "Product Master",
    description: "Products, synonyms, salts, lifecycle, MAH, and WHODrug mappings.",
  },
  {
    type: "LITERATURE_CALENDAR",
    label: "Literature Calendar",
    description: "Daily, weekly, monthly, or custom surveillance schedules.",
  },
  {
    type: "CLIENT_GUIDELINE",
    label: "Client Guidelines",
    description: "SOPs, work instructions, decision rules, and country guidance.",
  },
  {
    type: "OUTCOME_TEMPLATE",
    label: "Outcome Templates",
    description: "Client-controlled JSON, CSV, Excel, report, and API mappings.",
  },
];

const ACCEPT: Record<ResourceType, string> = {
  PRODUCT_MASTER: ".csv,.xlsx,.json",
  LITERATURE_CALENDAR: ".csv,.xlsx,.json",
  CLIENT_GUIDELINE: ".pdf,.docx,.txt,.md",
  OUTCOME_TEMPLATE: ".json",
  LITERATURE_SOURCE: ".json",
};

const DEFAULT_JSON: Record<ResourceType, string> = {
  PRODUCT_MASTER: JSON.stringify(
    {
      records: [
        {
          clientProductId: "PRODUCT-001",
          brandName: "Example Brand",
          genericName: "Example Generic",
          inn: "Example INN",
          api: "Example API",
          composition: "Example INN",
          chemicalNames: [],
          synonyms: ["Example synonym"],
          saltForms: [],
          dosageForm: "Tablet",
          formulation: "Immediate release tablet",
          route: "Oral",
          country: "India",
          mah: "Example MAH",
          mahEffectiveFrom: "2026-01-01",
          mahEffectiveTo: null,
          whodrugId: "",
          lifecycleStatus: "MARKETED",
          active: true,
        },
      ],
    },
    null,
    2,
  ),
  LITERATURE_CALENDAR: JSON.stringify(
    {
      records: [
        {
          calendarId: "CAL-001",
          productId: "PRODUCT-001",
          sourceKeys: ["PUBMED", "EUROPE_PMC"],
          frequency: "WEEKLY",
          executionDay: "MONDAY",
          executionTime: "09:00",
          timezone: "Asia/Kolkata",
          missedSearchDetection: true,
          status: "ACTIVE",
        },
      ],
    },
    null,
    2,
  ),
  CLIENT_GUIDELINE: JSON.stringify(
    {
      documentType: "client_guideline",
      title: "Client Literature Screening Guideline",
      content: "Enter governed client guideline content.",
      applicableWorkflowStage: "SCREENING",
    },
    null,
    2,
  ),
  OUTCOME_TEMPLATE: JSON.stringify(
    {
      outputFormat: "JSON",
      fieldMappings: {
        articleId: "article_identity.clinixai_article_id",
        pmid: "source_identifiers.pmid",
        companySuspectDrugs: "company_suspect_drugs",
        clinicalEvents: "clinical_events",
        activeMah: "active_mah",
        countryOfIncidence: "coi",
        screeningDecision: "screening_decision",
      },
      validation: {
        articleId: "required",
        screeningDecision: "required",
      },
    },
    null,
    2,
  ),
  LITERATURE_SOURCE: JSON.stringify({ records: [] }, null, 2),
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function TenantConfigurationConsole() {
  const [activeType, setActiveType] =
    useState<ResourceType>("PRODUCT_MASTER");
  const [activeView, setActiveView] = useState<
    "CONFIGURATION" | "SOURCES" | "AUDIT"
  >("CONFIGURATION");
  const [versions, setVersions] = useState<Version[]>([]);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [permissions, setPermissions] = useState<Permissions>({
    upload: false,
    create: false,
    validate: false,
    approve: false,
    activate: false,
    retire: false,
    manageSources: false,
  });
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const [configKey, setConfigKey] = useState("default");
  const [displayName, setDisplayName] = useState("Default Configuration");
  const [versionLabel, setVersionLabel] = useState("1.0.0");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [changeReason, setChangeReason] = useState(
    "Tenant-authorized configuration update.",
  );
  const [file, setFile] = useState<File | null>(null);
  const [jsonPayload, setJsonPayload] = useState(
    DEFAULT_JSON.PRODUCT_MASTER,
  );

  async function loadConfiguration() {
    setLoading(true);
    try {
      const [configResponse, sourceResponse] = await Promise.all([
        fetch("/api/admin/configuration", { cache: "no-store" }),
        fetch("/api/admin/literature-sources", { cache: "no-store" }),
      ]);

      const configPayload = await configResponse.json();
      const sourcePayload = await sourceResponse.json();

      if (!configResponse.ok || !configPayload.success) {
        throw new Error(
          configPayload.error || "Unable to load tenant configuration.",
        );
      }

      setVersions(configPayload.data.versions || []);
      setAudit(configPayload.data.audit || []);
      setPermissions(configPayload.data.permissions || {});

      if (sourceResponse.ok && sourcePayload.success) {
        setSources(sourcePayload.data || []);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useDeferredLoad(loadConfiguration);

  const visibleVersions = useMemo(
    () => versions.filter((version) => version.resourceType === activeType),
    [versions, activeType],
  );

  function selectResource(type: ResourceType) {
    setActiveType(type);
    setActiveView("CONFIGURATION");
    setJsonPayload(DEFAULT_JSON[type]);
    setFile(null);
  }

  async function uploadConfiguration() {
    if (!file) {
      setMessage("Select a configuration file before uploading.");
      return;
    }

    setWorking(true);
    setMessage("");

    try {
      const form = new FormData();
      form.set("resourceType", activeType);
      form.set("configKey", configKey);
      form.set("displayName", displayName);
      form.set("versionLabel", versionLabel);
      form.set("effectiveFrom", effectiveFrom);
      form.set("changeReason", changeReason);
      form.set("file", file);

      const response = await fetch("/api/admin/configuration/upload", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Configuration upload failed.");
      }

      setMessage(
        `${payload.data.displayName} ${payload.data.versionLabel} uploaded as a controlled draft.`,
      );
      setFile(null);
      await loadConfiguration();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  }

  async function createJsonDraft() {
    setWorking(true);
    setMessage("");

    try {
      const payloadValue = JSON.parse(jsonPayload);

      const response = await fetch("/api/admin/configuration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType: activeType,
          configKey,
          displayName,
          versionLabel,
          effectiveFrom,
          changeReason,
          payload: payloadValue,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to create JSON draft.");
      }

      setMessage(
        `${payload.data.displayName} ${payload.data.versionLabel} created as a controlled draft.`,
      );
      await loadConfiguration();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  }

  async function transition(
    version: Version,
    action: "VALIDATE" | "APPROVE" | "ACTIVATE" | "RETIRE",
  ) {
    const reason = window.prompt(
      `Enter the controlled reason for ${action.toLowerCase()} (${version.displayName} ${version.versionLabel}).`,
      changeReason,
    );

    if (!reason) return;
    if (reason.trim().length < 10) {
      setMessage("Lifecycle action reason must contain at least 10 characters.");
      return;
    }

    setWorking(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/configuration/${encodeURIComponent(version.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason }),
        },
      );
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Lifecycle action failed.");
      }

      setMessage(
        `${payload.data.displayName} ${payload.data.versionLabel} is now ${payload.data.lifecycleStatus}.`,
      );
      await loadConfiguration();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  }

  async function updateSource(
    source: Source,
    patch: Partial<Pick<Source, "enabled" | "maxResults">>,
  ) {
    setWorking(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/literature-sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceKey: source.sourceKey,
          ...patch,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to update literature source.");
      }

      setSources((current) =>
        current.map((item) =>
          item.sourceKey === source.sourceKey ? payload.data : item,
        ),
      );
      setMessage(`${source.displayName} configuration updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  }

  function actionsFor(version: Version) {
    return (
      <div className="row-actions">
        {permissions.validate &&
          ["draft", "validated"].includes(version.lifecycleStatus) && (
            <button
              type="button"
              onClick={() => void transition(version, "VALIDATE")}
            >
              Validate
            </button>
          )}

        {permissions.approve &&
          ["validated", "approved"].includes(version.lifecycleStatus) && (
            <button
              type="button"
              onClick={() => void transition(version, "APPROVE")}
            >
              Approve
            </button>
          )}

        {permissions.activate &&
          ["approved", "active"].includes(version.lifecycleStatus) && (
            <button
              type="button"
              className="primary"
              onClick={() => void transition(version, "ACTIVATE")}
            >
              Activate
            </button>
          )}

        {permissions.retire &&
          version.lifecycleStatus === "active" && (
            <button
              type="button"
              onClick={() => void transition(version, "RETIRE")}
            >
              Retire
            </button>
          )}
      </div>
    );
  }

  return (
    <div className="console">
      <aside className="admin-navigation">
        <div className="nav-title">
          <span>Tenant configuration</span>
          <strong>Administration</strong>
        </div>

        {RESOURCE_TABS.map((item) => (
          <button
            key={item.type}
            type="button"
            className={
              activeView === "CONFIGURATION" && activeType === item.type
                ? "active"
                : ""
            }
            onClick={() => selectResource(item.type)}
          >
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </button>
        ))}

        <button
          type="button"
          className={activeView === "SOURCES" ? "active" : ""}
          onClick={() => setActiveView("SOURCES")}
        >
          <strong>Literature Sources</strong>
          <small>Enable databases and control tenant result limits.</small>
        </button>

        <button
          type="button"
          className={activeView === "AUDIT" ? "active" : ""}
          onClick={() => setActiveView("AUDIT")}
        >
          <strong>Configuration History</strong>
          <small>Version transitions, actors, reasons, and timestamps.</small>
        </button>
      </aside>

      <section className="content">
        <div className="content-title">
          <div>
            <span>RBAC and tenant isolation enforced</span>
            <h2>
              {activeView === "CONFIGURATION"
                ? RESOURCE_TABS.find((item) => item.type === activeType)?.label
                : activeView === "SOURCES"
                  ? "Literature Sources"
                  : "Configuration History"}
            </h2>
          </div>
          <button type="button" onClick={() => void loadConfiguration()}>
            Refresh
          </button>
        </div>

        {message && <div className="message">{message}</div>}

        {activeView === "CONFIGURATION" && (
          <>
            <section className="editor">
              <div className="editor-meta">
                <label>
                  <span>Configuration Key</span>
                  <input
                    value={configKey}
                    onChange={(event) => setConfigKey(event.target.value)}
                  />
                </label>
                <label>
                  <span>Display Name</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </label>
                <label>
                  <span>Version</span>
                  <input
                    value={versionLabel}
                    onChange={(event) => setVersionLabel(event.target.value)}
                  />
                </label>
                <label>
                  <span>Effective From</span>
                  <input
                    type="datetime-local"
                    value={effectiveFrom}
                    onChange={(event) => setEffectiveFrom(event.target.value)}
                  />
                </label>
                <label className="wide">
                  <span>Change Reason</span>
                  <input
                    value={changeReason}
                    onChange={(event) => setChangeReason(event.target.value)}
                  />
                </label>
              </div>

              <div className="editor-body">
                <div className="upload-box">
                  <span>File upload</span>
                  <strong>Upload tenant-maintained configuration</strong>
                  <p>
                    Accepted format: {ACCEPT[activeType]}. Files are hashed,
                    stored, parsed, validated, versioned, and quarantined on
                    processing failure.
                  </p>
                  <input
                    type="file"
                    accept={ACCEPT[activeType]}
                    onChange={(event) =>
                      setFile(event.target.files?.[0] || null)
                    }
                  />
                  <button
                    type="button"
                    className="primary"
                    disabled={!permissions.upload || working || !file}
                    onClick={() => void uploadConfiguration()}
                  >
                    Upload as Draft
                  </button>
                </div>

                <div className="json-box">
                  <span>Manual JSON</span>
                  <strong>Create a controlled JSON draft</strong>
                  <textarea
                    value={jsonPayload}
                    onChange={(event) => setJsonPayload(event.target.value)}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    disabled={!permissions.create || working}
                    onClick={() => void createJsonDraft()}
                  >
                    Save JSON Draft
                  </button>
                </div>
              </div>
            </section>

            <section className="table-panel">
              <div className="table-title">
                <strong>Version Register</strong>
                <span>{visibleVersions.length} version(s)</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Configuration</th>
                      <th>Version</th>
                      <th>Status</th>
                      <th>Validation</th>
                      <th>Effective From</th>
                      <th>Source</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleVersions.map((version) => (
                      <tr key={version.id}>
                        <td>
                          <strong>{version.displayName}</strong>
                          <small>{version.configKey}</small>
                        </td>
                        <td>{version.versionLabel}</td>
                        <td>
                          <span className={`status ${version.lifecycleStatus}`}>
                            {version.lifecycleStatus}
                          </span>
                        </td>
                        <td>
                          {version.validationReport?.valid === true
                            ? "Valid"
                            : version.validationReport?.valid === false
                              ? `${version.validationReport.errors?.length || 0} error(s)`
                              : "Not validated"}
                        </td>
                        <td>{formatDate(version.effectiveFrom)}</td>
                        <td>{version.sourceFilename || "Manual JSON"}</td>
                        <td>{formatDate(version.createdAt)}</td>
                        <td>{actionsFor(version)}</td>
                      </tr>
                    ))}

                    {!loading && visibleVersions.length === 0 && (
                      <tr>
                        <td colSpan={8} className="empty">
                          No configuration versions are available for this
                          resource type.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {activeView === "SOURCES" && (
          <section className="source-list">
            {sources.map((source) => (
              <article key={source.sourceKey}>
                <div>
                  <span>{source.connectorType}</span>
                  <h3>{source.displayName}</h3>
                  <p>{source.sourceKey}</p>
                </div>

                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    disabled={!permissions.manageSources || working}
                    onChange={(event) =>
                      void updateSource(source, {
                        enabled: event.target.checked,
                      })
                    }
                  />
                  Enabled
                </label>

                <label>
                  <span>Maximum Results</span>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={source.maxResults}
                    disabled={!permissions.manageSources || working}
                    onChange={(event) =>
                      setSources((current) =>
                        current.map((item) =>
                          item.sourceKey === source.sourceKey
                            ? {
                                ...item,
                                maxResults: Number(event.target.value),
                              }
                            : item,
                        ),
                      )
                    }
                    onBlur={(event) =>
                      void updateSource(source, {
                        maxResults: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </article>
            ))}
          </section>
        )}

        {activeView === "AUDIT" && (
          <section className="table-panel">
            <div className="table-title">
              <strong>Configuration Audit Trail</strong>
              <span>{audit.length} event(s)</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Configuration</th>
                    <th>Version</th>
                    <th>Action</th>
                    <th>Transition</th>
                    <th>Actor</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((event) => (
                    <tr key={String(event.id)}>
                      <td>{formatDate(String(event.occurred_at || ""))}</td>
                      <td>
                        <strong>{String(event.display_name || "—")}</strong>
                        <small>{String(event.resource_type || "")}</small>
                      </td>
                      <td>{String(event.version_label || "—")}</td>
                      <td>{String(event.action || "—")}</td>
                      <td>
                        {String(event.previous_status || "—")} →{" "}
                        {String(event.new_status || "—")}
                      </td>
                      <td>
                        {String(
                          event.actor_name || event.actor_email || "System",
                        )}
                      </td>
                      <td>{String(event.reason || "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </section>

      <style jsx>{`
        .console {
          display: grid;
          grid-template-columns: 260px minmax(0, 1fr);
          min-height: 680px;
          border: 1px solid #b8c4d3;
          border-radius: 4px;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 3px 12px rgba(15, 23, 42, 0.07);
        }

        button,
        input,
        textarea {
          font: inherit;
        }

        .admin-navigation {
          border-right: 1px solid #b8c4d3;
          background: #e8edf4;
        }

        .nav-title {
          display: grid;
          gap: 3px;
          padding: 15px;
          color: #ffffff;
          background: #0f172a;
        }

        .nav-title span {
          color: #7dd3fc;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .nav-title strong {
          font-size: 13px;
        }

        .admin-navigation > button {
          display: grid;
          width: 100%;
          gap: 4px;
          padding: 12px 14px;
          border: 0;
          border-bottom: 1px solid #cbd5e1;
          color: #334155;
          background: transparent;
          text-align: left;
          cursor: pointer;
        }

        .admin-navigation > button:hover {
          background: #dbeafe;
        }

        .admin-navigation > button.active {
          color: #0f172a;
          background: #ffffff;
          box-shadow: inset 4px 0 #185abd;
        }

        .admin-navigation strong {
          font-size: 9px;
        }

        .admin-navigation small {
          color: #64748b;
          font-size: 7px;
          line-height: 1.4;
        }

        .content {
          min-width: 0;
          background: #f4f7fb;
        }

        .content-title {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 17px;
          border-bottom: 1px solid #cbd5e1;
          background: #ffffff;
        }

        .content-title span {
          color: #185abd;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        h2 {
          margin: 3px 0 0;
          font-size: 18px;
        }

        button {
          border: 1px solid #94a3b8;
          border-radius: 3px;
          padding: 7px 10px;
          color: #334155;
          background: #ffffff;
          font-size: 8px;
          font-weight: 800;
          cursor: pointer;
        }

        button.primary {
          border-color: #185abd;
          color: #ffffff;
          background: #185abd;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .message {
          margin: 12px 14px 0;
          padding: 10px 12px;
          border: 1px solid #93c5fd;
          border-radius: 3px;
          color: #1e3a8a;
          background: #eff6ff;
          font-size: 8px;
          font-weight: 700;
        }

        .editor,
        .table-panel,
        .source-list {
          margin: 14px;
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          background: #ffffff;
        }

        .editor-meta {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          padding: 13px;
          border-bottom: 1px solid #dbe4ef;
          background: #f8fafc;
        }

        label {
          display: grid;
          gap: 5px;
        }

        label.wide {
          grid-column: 1 / -1;
        }

        label > span,
        .upload-box > span,
        .json-box > span {
          color: #475569;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.045em;
          text-transform: uppercase;
        }

        input,
        textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #b8c4d3;
          border-radius: 3px;
          padding: 8px 9px;
          color: #0f172a;
          background: #ffffff;
          font-size: 9px;
          outline: none;
        }

        input:focus,
        textarea:focus {
          border-color: #185abd;
          box-shadow: 0 0 0 2px rgba(24, 90, 189, 0.1);
        }

        .editor-body {
          display: grid;
          grid-template-columns: 0.8fr 1.2fr;
          gap: 12px;
          padding: 13px;
        }

        .upload-box,
        .json-box {
          display: grid;
          align-content: start;
          gap: 8px;
          padding: 13px;
          border: 1px solid #dbe4ef;
          border-radius: 3px;
          background: #f8fafc;
        }

        .upload-box strong,
        .json-box strong {
          font-size: 10px;
        }

        .upload-box p {
          margin: 0;
          color: #64748b;
          font-size: 8px;
          line-height: 1.5;
        }

        .json-box textarea {
          min-height: 245px;
          resize: vertical;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 8px;
        }

        .table-title {
          display: flex;
          justify-content: space-between;
          padding: 11px 13px;
          border-bottom: 1px solid #dbe4ef;
          background: #f8fafc;
          font-size: 9px;
        }

        .table-title span {
          color: #64748b;
          font-size: 8px;
        }

        .table-wrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          min-width: 1020px;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 10px 11px;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
          vertical-align: top;
          font-size: 8px;
        }

        th {
          color: #475569;
          background: #f8fafc;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.045em;
          text-transform: uppercase;
        }

        td strong,
        td small {
          display: block;
        }

        td small {
          margin-top: 3px;
          color: #64748b;
          font-size: 7px;
        }

        .status {
          display: inline-flex;
          padding: 5px 7px;
          border-radius: 999px;
          color: #475569;
          background: #e2e8f0;
          font-size: 7px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .status.active {
          color: #166534;
          background: #dcfce7;
        }

        .status.approved,
        .status.validated {
          color: #1e40af;
          background: #dbeafe;
        }

        .status.rejected,
        .status.retired {
          color: #991b1b;
          background: #fee2e2;
        }

        .row-actions {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }

        .empty {
          padding: 28px;
          color: #64748b;
          text-align: center;
        }

        .source-list {
          display: grid;
          gap: 0;
        }

        .source-list article {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) 150px 180px;
          align-items: center;
          gap: 16px;
          padding: 14px;
          border-bottom: 1px solid #dbe4ef;
        }

        .source-list article:last-child {
          border-bottom: 0;
        }

        .source-list article > div > span {
          color: #185abd;
          font-size: 7px;
          font-weight: 900;
          text-transform: uppercase;
        }

        h3 {
          margin: 3px 0;
          font-size: 12px;
        }

        .source-list p {
          margin: 0;
          color: #64748b;
          font-size: 8px;
        }

        .toggle {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #334155;
          font-size: 9px;
          font-weight: 800;
        }

        .toggle input {
          width: auto;
        }

        @media (max-width: 1000px) {
          .console {
            grid-template-columns: 1fr;
          }

          .admin-navigation {
            display: flex;
            overflow-x: auto;
            border-right: 0;
            border-bottom: 1px solid #b8c4d3;
          }

          .nav-title {
            min-width: 170px;
          }

          .admin-navigation > button {
            min-width: 190px;
            border-right: 1px solid #cbd5e1;
          }

          .editor-meta {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 700px) {
          .editor-body,
          .editor-meta,
          .source-list article {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
