"use client";

import { useEffect, useMemo, useState } from "react";

type Source = {
  sourceKey: string;
  displayName: string;
  enabled: boolean;
  maxResults: number;
};

type SearchResult = {
  id: string;
  sourceKey: string;
  sourceRecordId: string;
  pmid?: string;
  doi?: string;
  title: string;
  authors: string[];
  journal?: string;
  publicationDate?: string;
  language?: string;
  publicationType?: string;
  abstractText?: string;
  landingUrl?: string;
  fullTextStatus: string;
  duplicateGroup?: string;
  matchMetadata: Record<string, unknown>;
};

type SearchExecution = {
  searchId: string;
  searchKey: string;
  status: string;
  resultCount: number;
  translatedQueries: Record<string, string>;
  connectorErrors: Record<string, string>;
  results: SearchResult[];
  durationMs: number;
};

const EMPTY_FORM = {
  searchString: "",
  pmid: "",
  doi: "",
  product: "",
  productId: "",
  whodrugId: "",
  date: "",
  dateFrom: "",
  dateTo: "",
  limit: "50",
};

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export default function AdHocSearchWorkspace() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [execution, setExecution] = useState<SearchExecution | null>(null);
  const [selectedResults, setSelectedResults] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [creatingPackages, setCreatingPackages] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadWorkspace();
  }, []);

  async function loadWorkspace() {
    setLoading(true);
    try {
      const response = await fetch("/api/literature/adhoc-search", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to load search workspace.");
      }

      const available = (payload.data.sources || []) as Source[];
      setSources(available);
      setSelectedSources(
        available.filter((source) => source.enabled).map((source) => source.sourceKey),
      );
      setRecentSearches(payload.data.recentSearches || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  const selectedSourceRecords = useMemo(
    () => sources.filter((source) => selectedSources.includes(source.sourceKey)),
    [sources, selectedSources],
  );

  function updateForm(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleSource(sourceKey: string) {
    setSelectedSources((current) =>
      current.includes(sourceKey)
        ? current.filter((value) => value !== sourceKey)
        : [...current, sourceKey],
    );
  }

  async function runSearch() {
    setRunning(true);
    setMessage("");
    setSelectedResults([]);

    try {
      const response = await fetch("/api/literature/adhoc-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: {
            ...form,
            limit: Number(form.limit || 50),
            sourceKeys: selectedSources,
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Enterprise Literature Search failed.");
      }

      setExecution(payload.data);
      setMessage(
        `Search ${payload.data.searchKey} completed with ${payload.data.resultCount} normalized result(s).`,
      );
      await loadRecentOnly();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  async function loadRecentOnly() {
    const response = await fetch("/api/literature/adhoc-search", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (response.ok && payload.success) {
      setRecentSearches(payload.data.recentSearches || []);
    }
  }

  function toggleResult(resultId: string) {
    setSelectedResults((current) =>
      current.includes(resultId)
        ? current.filter((value) => value !== resultId)
        : [...current, resultId],
    );
  }

  function toggleAllResults() {
    if (!execution) return;
    const ids = execution.results.map((result) => result.id);
    setSelectedResults((current) =>
      current.length === ids.length ? [] : ids,
    );
  }

  async function createEvidencePackages() {
    setCreatingPackages(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/literature/adhoc-search/evidence",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resultIds: selectedResults }),
        },
      );

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error || "Evidence Package creation failed.",
        );
      }

      setMessage(
        `${payload.data.createdCount} governed Evidence Package(s) created. Open Workflow to continue to Hits.`,
      );
      setSelectedResults([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCreatingPackages(false);
    }
  }

  function exportResults(format: "json" | "csv") {
    if (!execution) return;

    let content: string;
    let mediaType: string;
    let extension: string;

    if (format === "json") {
      content = JSON.stringify(execution, null, 2);
      mediaType = "application/json";
      extension = "json";
    } else {
      const headers = [
        "Source",
        "PMID",
        "DOI",
        "Title",
        "Authors",
        "Journal",
        "Publication Date",
        "Language",
        "Publication Type",
        "Full Text Status",
        "URL",
      ];
      const rows = execution.results.map((result) =>
        [
          result.sourceKey,
          result.pmid,
          result.doi,
          result.title,
          result.authors,
          result.journal,
          result.publicationDate,
          result.language,
          result.publicationType,
          result.fullTextStatus,
          result.landingUrl,
        ]
          .map(csvCell)
          .join(","),
      );
      content = [headers.map(csvCell).join(","), ...rows].join("\n");
      mediaType = "text/csv";
      extension = "csv";
    }

    const url = URL.createObjectURL(
      new Blob([content], { type: mediaType }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${execution.searchKey}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="workspace-grid">
      <section className="search-panel">
        <div className="panel-title">
          <div>
            <span>RBAC-controlled utility</span>
            <h2>Enterprise Literature Search</h2>
            <p>
              Search by exact PMID or DOI, or by governed product identity. Product IDs are resolved through the active
              tenant Product Master before external databases are queried.
            </p>
          </div>
          <button type="button" onClick={() => setForm(EMPTY_FORM)}>
            Clear
          </button>
        </div>

        <div className="form-grid">
          <label className="wide">
            <span>Search String / Boolean Query</span>
            <textarea
              value={form.searchString}
              onChange={(event) =>
                updateForm("searchString", event.target.value)
              }
              placeholder='Example: "drug induced liver injury" OR hepatotoxicity'
            />
          </label>


          <label>
            <span>PMID</span>
            <input
              inputMode="numeric"
              value={form.pmid}
              onChange={(event) => updateForm("pmid", event.target.value)}
              placeholder="Exact PubMed identifier"
            />
          </label>

          <label>
            <span>DOI</span>
            <input
              value={form.doi}
              onChange={(event) => updateForm("doi", event.target.value)}
              placeholder="10.xxxx/xxxxx or DOI URL"
            />
          </label>

          <label>
            <span>Product</span>
            <input
              value={form.product}
              onChange={(event) => updateForm("product", event.target.value)}
              placeholder="Brand, generic, INN, API, salt"
            />
          </label>

          <label>
            <span>Client Product ID</span>
            <input
              value={form.productId}
              onChange={(event) => updateForm("productId", event.target.value)}
              placeholder="Client Product Master ID"
            />
          </label>

          <label>
            <span>WHODrug ID</span>
            <input
              value={form.whodrugId}
              onChange={(event) => updateForm("whodrugId", event.target.value)}
              placeholder="WHODrug identifier"
            />
          </label>

          <label>
            <span>Single Date</span>
            <input
              type="date"
              value={form.date}
              onChange={(event) => updateForm("date", event.target.value)}
            />
          </label>

          <label>
            <span>Date From</span>
            <input
              type="date"
              value={form.dateFrom}
              onChange={(event) => updateForm("dateFrom", event.target.value)}
            />
          </label>

          <label>
            <span>Date To</span>
            <input
              type="date"
              value={form.dateTo}
              onChange={(event) => updateForm("dateTo", event.target.value)}
            />
          </label>

          <label>
            <span>Maximum Results per Database</span>
            <input
              type="number"
              min="1"
              max="500"
              value={form.limit}
              onChange={(event) => updateForm("limit", event.target.value)}
            />
          </label>
        </div>

        <div className="database-section">
          <div>
            <strong>Databases</strong>
            <small>
              No selection means all enabled tenant databases. A database-only
              search is allowed when the result limit is 100 or fewer.
            </small>
          </div>

          <div className="source-grid">
            {sources.map((source) => (
              <label
                key={source.sourceKey}
                className={!source.enabled ? "disabled" : ""}
              >
                <input
                  type="checkbox"
                  checked={selectedSources.includes(source.sourceKey)}
                  disabled={!source.enabled}
                  onChange={() => toggleSource(source.sourceKey)}
                />
                <span>
                  <strong>{source.displayName}</strong>
                  <small>
                    {source.enabled
                      ? `Enabled · Maximum ${source.maxResults}`
                      : "Disabled by tenant administrator"}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="command-row">
          <span>
            {selectedSourceRecords.length} database(s) selected
          </span>
          <button
            type="button"
            className="primary"
            disabled={running || loading}
            onClick={() => void runSearch()}
          >
            {running ? "Searching…" : "Execute Enterprise Search"}
          </button>
        </div>
      </section>

      <aside className="history-panel">
        <div className="panel-title compact">
          <div>
            <span>Audit-visible</span>
            <h2>Recent Searches</h2>
          </div>
          <button type="button" onClick={() => void loadRecentOnly()}>
            Refresh
          </button>
        </div>

        <div className="history-list">
          {recentSearches.map((search) => (
            <article key={String(search.id)}>
              <strong>{String(search.search_key || "Search")}</strong>
              <span>{String(search.status || "unknown")}</span>
              <p>{Number(search.result_count || 0)} result(s)</p>
              <small>{String(search.created_at || "")}</small>
            </article>
          ))}

          {!loading && recentSearches.length === 0 && (
            <p className="empty">No enterprise search history is available.</p>
          )}
        </div>
      </aside>

      {message && <div className="message">{message}</div>}

      {execution && (
        <section className="results-panel">
          <div className="results-command">
            <div>
              <span>Search execution</span>
              <h2>{execution.searchKey}</h2>
              <p>
                {execution.resultCount} result(s) · {execution.durationMs} ms ·{" "}
                {execution.status}
              </p>
            </div>

            <div className="result-actions">
              <button type="button" onClick={() => exportResults("csv")}>
                Export CSV
              </button>
              <button type="button" onClick={() => exportResults("json")}>
                Export JSON
              </button>
              <button
                type="button"
                className="primary"
                disabled={
                  selectedResults.length === 0 || creatingPackages
                }
                onClick={() => void createEvidencePackages()}
              >
                {creatingPackages
                  ? "Creating…"
                  : `Create Evidence Package (${selectedResults.length})`}
              </button>
            </div>
          </div>

          {Object.keys(execution.connectorErrors).length > 0 && (
            <div className="connector-errors">
              {Object.entries(execution.connectorErrors).map(
                ([source, error]) => (
                  <p key={source}>
                    <strong>{source}:</strong> {error}
                  </p>
                ),
              )}
            </div>
          )}

          <details className="translated-queries">
            <summary>View translated database queries</summary>
            {Object.entries(execution.translatedQueries).map(
              ([source, query]) => (
                <div key={source}>
                  <strong>{source}</strong>
                  <code>{query}</code>
                </div>
              ),
            )}
          </details>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={
                        execution.results.length > 0 &&
                        selectedResults.length === execution.results.length
                      }
                      onChange={toggleAllResults}
                      aria-label="Select all search results"
                    />
                  </th>
                  <th>Database</th>
                  <th>Identifiers</th>
                  <th>Article</th>
                  <th>Authors / Journal</th>
                  <th>Publication</th>
                  <th>Type</th>
                  <th>Access</th>
                  <th>Duplicate</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {execution.results.map((result) => (
                  <tr key={result.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedResults.includes(result.id)}
                        onChange={() => toggleResult(result.id)}
                      />
                    </td>
                    <td>
                      <span className="source-badge">{result.sourceKey}</span>
                    </td>
                    <td className="identifiers">
                      <strong>{result.pmid ? `PMID ${result.pmid}` : "—"}</strong>
                      <small>{result.doi ? `DOI ${result.doi}` : ""}</small>
                    </td>
                    <td className="article">
                      <strong>{result.title}</strong>
                      {result.abstractText && (
                        <small>{result.abstractText.slice(0, 180)}…</small>
                      )}
                    </td>
                    <td>
                      <strong>{result.authors.slice(0, 3).join(", ") || "—"}</strong>
                      <small>{result.journal || "—"}</small>
                    </td>
                    <td>
                      <strong>{result.publicationDate || "—"}</strong>
                      <small>{result.language || "—"}</small>
                    </td>
                    <td>{result.publicationType || "—"}</td>
                    <td>{result.fullTextStatus.replaceAll("_", " ")}</td>
                    <td>
                      {result.duplicateGroup ? (
                        <span className="duplicate-badge">Merged source</span>
                      ) : (
                        "Unique"
                      )}
                    </td>
                    <td>
                      {result.landingUrl ? (
                        <a
                          href={result.landingUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Source
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <style jsx>{`
        .workspace-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 290px;
          gap: 14px;
        }

        .search-panel,
        .history-panel,
        .results-panel {
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          background: #ffffff;
          box-shadow: 0 3px 10px rgba(15, 23, 42, 0.05);
        }

        .panel-title,
        .results-command {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          padding: 16px 18px;
          border-bottom: 1px solid #dbe4ef;
          background: #f8fafc;
        }

        .panel-title.compact {
          padding: 13px 14px;
        }

        .panel-title span,
        .results-command span {
          color: #185abd;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        h2 {
          margin: 3px 0;
          color: #0f172a;
          font-size: 17px;
        }

        .panel-title p,
        .results-command p {
          margin: 0;
          color: #64748b;
          font-size: 10px;
          line-height: 1.5;
        }

        button,
        input,
        textarea {
          font: inherit;
        }

        button {
          border: 1px solid #94a3b8;
          border-radius: 3px;
          padding: 8px 12px;
          color: #334155;
          background: #ffffff;
          font-size: 9px;
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
          opacity: 0.5;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          padding: 17px 18px;
        }

        label {
          display: grid;
          gap: 6px;
        }

        label.wide {
          grid-column: 1 / -1;
        }

        label > span {
          color: #475569;
          font-size: 8px;
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
          padding: 9px 10px;
          color: #0f172a;
          background: #ffffff;
          font-size: 10px;
          outline: none;
        }

        textarea {
          min-height: 70px;
          resize: vertical;
        }

        input:focus,
        textarea:focus {
          border-color: #185abd;
          box-shadow: 0 0 0 2px rgba(24, 90, 189, 0.1);
        }

        .database-section {
          margin: 0 18px 17px;
          padding: 14px;
          border: 1px solid #dbe4ef;
          border-radius: 3px;
          background: #f8fafc;
        }

        .database-section > div:first-child {
          display: grid;
          gap: 3px;
        }

        .database-section > div:first-child strong {
          font-size: 11px;
        }

        .database-section small {
          color: #64748b;
          font-size: 8px;
          line-height: 1.45;
        }

        .source-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 11px;
        }

        .source-grid label {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px;
          border: 1px solid #dbe4ef;
          border-radius: 3px;
          background: #ffffff;
          cursor: pointer;
        }

        .source-grid label.disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .source-grid input {
          width: auto;
        }

        .source-grid span {
          display: grid;
          gap: 2px;
          text-transform: none;
          letter-spacing: normal;
        }

        .source-grid strong {
          color: #0f172a;
          font-size: 9px;
        }

        .source-grid small {
          font-size: 7px;
        }

        .command-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 18px;
          border-top: 1px solid #dbe4ef;
          background: #f8fafc;
        }

        .command-row span {
          color: #64748b;
          font-size: 9px;
        }

        .history-list {
          display: grid;
          max-height: 510px;
          overflow-y: auto;
        }

        .history-list article {
          padding: 12px 14px;
          border-bottom: 1px solid #e2e8f0;
        }

        .history-list strong,
        .history-list span,
        .history-list small {
          display: block;
        }

        .history-list strong {
          color: #0f172a;
          font-size: 9px;
        }

        .history-list span {
          margin-top: 4px;
          color: #185abd;
          font-size: 7px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .history-list p {
          margin: 5px 0;
          color: #475569;
          font-size: 9px;
        }

        .history-list small,
        .empty {
          color: #94a3b8;
          font-size: 7px;
        }

        .empty {
          padding: 18px;
        }

        .message {
          grid-column: 1 / -1;
          padding: 11px 14px;
          border: 1px solid #93c5fd;
          border-radius: 3px;
          color: #1e3a8a;
          background: #eff6ff;
          font-size: 9px;
          font-weight: 700;
        }

        .results-panel {
          grid-column: 1 / -1;
          overflow: hidden;
        }

        .result-actions {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }

        .connector-errors {
          padding: 10px 16px;
          border-bottom: 1px solid #fecaca;
          color: #991b1b;
          background: #fef2f2;
          font-size: 9px;
        }

        .connector-errors p {
          margin: 3px 0;
        }

        .translated-queries {
          padding: 10px 16px;
          border-bottom: 1px solid #dbe4ef;
          color: #334155;
          background: #f8fafc;
          font-size: 9px;
        }

        .translated-queries summary {
          cursor: pointer;
          font-weight: 800;
        }

        .translated-queries div {
          display: grid;
          grid-template-columns: 100px 1fr;
          gap: 8px;
          margin-top: 8px;
        }

        .translated-queries code {
          overflow-x: auto;
          color: #0f172a;
          white-space: pre-wrap;
        }

        .table-wrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          min-width: 1380px;
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

        td input {
          width: auto;
        }

        td strong,
        td small {
          display: block;
        }

        td small {
          margin-top: 4px;
          color: #64748b;
          line-height: 1.45;
        }

        .article {
          min-width: 300px;
        }

        .identifiers {
          min-width: 150px;
        }

        .source-badge,
        .duplicate-badge {
          display: inline-flex;
          padding: 5px 7px;
          border-radius: 999px;
          font-size: 7px;
          font-weight: 900;
          white-space: nowrap;
        }

        .source-badge {
          color: #1e40af;
          background: #dbeafe;
        }

        .duplicate-badge {
          color: #92400e;
          background: #fef3c7;
        }

        td a {
          color: #185abd;
          font-weight: 800;
        }

        @media (max-width: 1050px) {
          .workspace-grid {
            grid-template-columns: 1fr;
          }

          .history-panel {
            grid-row: auto;
          }

          .form-grid,
          .source-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 650px) {
          .form-grid,
          .source-grid {
            grid-template-columns: 1fr;
          }

          label.wide {
            grid-column: auto;
          }

          .panel-title,
          .results-command,
          .command-row {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
