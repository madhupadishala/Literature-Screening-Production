"use client";

import { useMemo, useState } from "react";

const navItems = ["Search", "Screening", "Intake", "Quality", "Reporting"];

const productMaster = [
  {
    productId: "PID-001",
    product: "Paracetamol",
    inn: "Acetaminophen",
    variants: ["Tablet", "Injection", "Syrup", "Oral Suspension"],
    synonyms: ["paracetamol", "acetaminophen", "tylenol", "apap", "n-acetyl-p-aminophenol"],
    mahCountries: ["India", "Germany", "United States", "United Kingdom"],
  },
];

const rawMockArticles = [
  {
    sno: 1,
    pmid: "38912721",
    doi: "10.1002/pds.5421",
    primaryAuthor: "Schmidt M.",
    primaryAuthorCountry: "Germany",
    authors: "Schmidt M.; Weber L.",
    title: "Severe hepatic injury following exposure to acetaminophen tablets",
    pii: "Yes",
    textAvailability: "Abstract",
    fullTextLink: "",
  },
  {
    sno: 2,
    pmid: "38912722",
    doi: "10.1111/jcp.1290",
    primaryAuthor: "Patel S.",
    primaryAuthorCountry: "India",
    authors: "Patel S.; Rao V.; Kumar A.",
    title: "Injection-related medication error with paracetamol in hospital practice",
    pii: "No",
    textAvailability: "Full Text",
    fullTextLink: "https://example.com/fulltext/38912722",
  },
];

function findProduct(productId: string, productName: string) {
  const id = productId.trim().toLowerCase();
  const name = productName.trim().toLowerCase();

  return (
    productMaster.find((p) => p.productId.toLowerCase() === id) ||
    productMaster.find((p) => p.product.toLowerCase() === name) ||
    productMaster.find((p) => p.inn.toLowerCase() === name) ||
    productMaster.find((p) => p.synonyms.includes(name)) ||
    null
  );
}

function buildAutoQuery(
  product: (typeof productMaster)[number] | null,
  fallbackText: string,
) {
  if (!product) return fallbackText.trim();

  const terms = [product.product, product.inn, ...product.synonyms]
    .filter(Boolean)
    .map((term) => `"${term}"`);

  return `(${terms.join(" OR ")}) AND ("adverse event" OR toxicity OR safety OR injury)`;
}

function applyDateFilter(
  query: string,
  dateMode: string,
  startDate: string,
  endDate: string,
  calendarRunId: string,
) {
  let finalQuery = query.trim();

  if (dateMode === "Specific date" && startDate) {
    finalQuery += ` AND "${startDate}"[Date - Publication]`;
  }

  if (dateMode === "Date range" && startDate && endDate) {
    finalQuery += ` AND ("${startDate}"[Date - Publication] : "${endDate}"[Date - Publication])`;
  }

  if (dateMode === "Calendar run" && calendarRunId) {
    finalQuery += ` /* Calendar Run: ${calendarRunId} */`;
  }

  return finalQuery;
}

function enrichArticle(
  article: (typeof rawMockArticles)[number],
  product: (typeof productMaster)[number] | null,
) {
  const resolvedProduct = product || productMaster[0];
  const text = article.title.toLowerCase();

  const matchedSynonym = resolvedProduct.synonyms.find((s) => text.includes(s));
  const matchedVariant = resolvedProduct.variants.find((v) => text.includes(v.toLowerCase()));

  return {
    ...article,
    product: resolvedProduct.product,
    productId: resolvedProduct.productId,
    inn: resolvedProduct.inn,
    productVariant: matchedVariant || "Not confirmed",
    mahCountry: resolvedProduct.mahCountries.includes(article.primaryAuthorCountry)
      ? article.primaryAuthorCountry
      : "Needs verification",
    knowledgeMatch: matchedSynonym || "No direct synonym match",
    stage: "Hits",
    status: matchedSynonym ? "Ready for QC" : "Needs QC Review",
    decision: "",
  };
}

export default function Home() {
  const [active, setActive] = useState("Search");
  const [searchMode, setSearchMode] = useState<"Automatic" | "Manual">("Automatic");
  const [productId, setProductId] = useState("PID-001");
  const [productName, setProductName] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  const [source, setSource] = useState("PubMed");
  const [limit, setLimit] = useState("50");

  const [dateMode, setDateMode] = useState("Any date");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [calendarRunId, setCalendarRunId] = useState("");

  const [records, setRecords] = useState<ReturnType<typeof enrichArticle>[]>([]);
  const [jobStatus, setJobStatus] = useState("Ready");
  const [generatedQuery, setGeneratedQuery] = useState("");

  const resolvedProduct = useMemo(
    () => findProduct(productId, productName),
    [productId, productName],
  );

  function executeSearch() {
    setJobStatus("Running");

    const baseQuery =
      searchMode === "Automatic"
        ? buildAutoQuery(resolvedProduct, manualQuery)
        : manualQuery.trim();

    const finalQuery = applyDateFilter(
      baseQuery || "No product/query provided",
      dateMode,
      startDate,
      endDate,
      calendarRunId,
    );

    setGeneratedQuery(finalQuery);

    setTimeout(() => {
      const enriched = rawMockArticles.map((article) => enrichArticle(article, resolvedProduct));
      setRecords(enriched);
      setJobStatus("Completed");
    }, 500);
  }

  function sendToScreening() {
    setRecords((prev) =>
      prev.map((r) => ({
        ...r,
        stage: "Screening",
        status: "Pending Screening",
      })),
    );
    setActive("Screening");
  }

  function runScreening() {
    setRecords((prev) =>
      prev.map((r) => ({
        ...r,
        status: "Screening Completed",
        decision: r.pii === "Yes" ? "Include" : "Review",
      })),
    );
  }

  const hits = records.filter((r) => r.stage === "Hits");
  const screening = records.filter((r) => r.stage === "Screening");

  return (
    <main className="cx-app">
      <header className="cx-topbar">
        <div>
          <div className="cx-brand">ClinixAI Nexus</div>
          <div className="cx-subbrand">Literature Screening Enterprise MVP</div>
        </div>

        <div className="cx-env">PRODUCTION</div>

        <div className="cx-user">
          <div>Althaf (Super User)</div>
          <span>Novartis Literature Review</span>
        </div>
      </header>

      <nav className="cx-nav">
        {navItems.map((item) => (
          <button
            key={item}
            className={active === item ? "active" : ""}
            onClick={() => setActive(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <section className="cx-status-strip">
        <div className="cx-status-tab active">
          <span>Search Job</span>
          <b>{jobStatus}</b>
        </div>
        <div className="cx-status-tab">
          <span>Mode</span>
          <b>{searchMode}</b>
        </div>
        <div className="cx-status-tab">
          <span>Date</span>
          <b>{dateMode}</b>
        </div>
        <div className="cx-status-tab">
          <span>Hits</span>
          <b>{hits.length}</b>
        </div>
        <div className="cx-status-tab">
          <span>Screening</span>
          <b>{screening.length}</b>
        </div>
        <div className="cx-status-tab">
          <span>Knowledge</span>
          <b>{resolvedProduct ? "Loaded" : "Partial"}</b>
        </div>
      </section>

      {active === "Search" && (
        <>
          <section className="cx-module">
            <div className="cx-ribbon cx-ribbon-search" />

            <div className="cx-module-title cx-spread">
              <span>Search Configuration</span>
              <small>All fields optional · Source defaults to PubMed</small>
            </div>

            <div className="cx-search-grid">
              <div className="cx-field-group cx-query">
                <label>Search Mode</label>
                <select
                  value={searchMode}
                  onChange={(e) => setSearchMode(e.target.value as "Automatic" | "Manual")}
                >
                  <option>Automatic</option>
                  <option>Manual</option>
                </select>

                <label>
                  Boolean Search String {searchMode === "Automatic" ? "(optional)" : "(manual)"}
                </label>
                <textarea
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  placeholder='Optional: paracetamol AND ("adverse event" OR toxicity)'
                />
              </div>

              <div className="cx-field-group">
                <label>Product ID (optional)</label>
                <input
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  placeholder="PID-001"
                />

                <label>Product Name (optional)</label>
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Paracetamol"
                />

                <label>Source</label>
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option>PubMed</option>
                </select>
              </div>

              <div className="cx-field-group">
                <label>Date Mode</label>
                <select value={dateMode} onChange={(e) => setDateMode(e.target.value)}>
                  <option>Any date</option>
                  <option>Specific date</option>
                  <option>Date range</option>
                  <option>Calendar run</option>
                </select>

                {dateMode !== "Any date" && (
                  <>
                    <label>{dateMode === "Specific date" ? "Search Date" : "Start Date"}</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </>
                )}

                {dateMode === "Date range" && (
                  <>
                    <label>End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </>
                )}

                {dateMode === "Calendar run" && (
                  <>
                    <label>Calendar Run ID</label>
                    <input
                      value={calendarRunId}
                      onChange={(e) => setCalendarRunId(e.target.value)}
                      placeholder="CAL-2026-001"
                    />
                  </>
                )}

                <label>Maximum PMIDs</label>
                <select value={limit} onChange={(e) => setLimit(e.target.value)}>
                  <option>20</option>
                  <option>50</option>
                  <option>100</option>
                  <option>250</option>
                  <option>500</option>
                </select>

                <div className="cx-kv">
                  <div>
                    <span>Resolved Product</span>
                    <b>{resolvedProduct?.product || "Not resolved"}</b>
                  </div>
                  <div>
                    <span>INN</span>
                    <b>{resolvedProduct?.inn || "-"}</b>
                  </div>
                  <div>
                    <span>Synonyms</span>
                    <b>{resolvedProduct?.synonyms.length || 0}</b>
                  </div>
                  <div>
                    <span>MAH Countries</span>
                    <b>{resolvedProduct?.mahCountries.length || 0}</b>
                  </div>
                </div>

                <button className="cx-execute" onClick={executeSearch}>
                  {jobStatus === "Running" ? "Running..." : "▶ Execute"}
                </button>
              </div>
            </div>

            {generatedQuery && (
              <div className="cx-query-preview">
                <b>Generated Query:</b> {generatedQuery}
              </div>
            )}
          </section>

          <section className="cx-module">
            <div className="cx-ribbon cx-ribbon-pipeline" />

            <div className="cx-module-title cx-spread">
              <span>Hits Output</span>
              <small>{hits.length} article(s) generated · QC verifies exceptions</small>
            </div>

            <HitsTable records={hits} />

            {hits.length > 0 && (
              <button className="cx-execute" onClick={sendToScreening}>
                Send to Screening →
              </button>
            )}
          </section>
        </>
      )}

      {active === "Screening" && (
        <section className="cx-module">
          <div className="cx-ribbon cx-ribbon-pipeline" />

          <div className="cx-module-title cx-spread">
            <span>Screening Workspace</span>
            <small>{screening.length} article(s) pending</small>
          </div>

          <HitsTable records={screening} showDecision />

          {screening.length > 0 && (
            <button className="cx-execute" onClick={runScreening}>
              Run AI Screening
            </button>
          )}
        </section>
      )}
    </main>
  );
}

function HitsTable({
  records,
  showDecision = false,
}: {
  records: ReturnType<typeof enrichArticle>[];
  showDecision?: boolean;
}) {
  return (
    <table className="cx-table">
      <thead>
        <tr>
          <th>S.No</th>
          <th>PMID</th>
          <th>DOI</th>
          <th>Primary Author</th>
          <th>Primary Author Country</th>
          <th>Authors</th>
          <th>Product</th>
          <th>INN</th>
          <th>Product Variant</th>
          <th>MAH Country</th>
          <th>PII</th>
          <th>Full Text / Abstract</th>
          <th>Full Text Link</th>
          <th>Knowledge Match</th>
          <th>Status</th>
          {showDecision && <th>Decision</th>}
        </tr>
      </thead>

      <tbody>
        {records.length === 0 ? (
          <tr>
            <td colSpan={showDecision ? 16 : 15} className="cx-empty">
              empty
            </td>
          </tr>
        ) : (
          records.map((row) => (
            <tr key={row.pmid}>
              <td>{row.sno}</td>
              <td>{row.pmid}</td>
              <td>{row.doi}</td>
              <td>{row.primaryAuthor}</td>
              <td>{row.primaryAuthorCountry}</td>
              <td>{row.authors}</td>
              <td>{row.product}</td>
              <td>{row.inn}</td>
              <td>{row.productVariant}</td>
              <td>{row.mahCountry}</td>
              <td>{row.pii}</td>
              <td>{row.textAvailability}</td>
              <td>{row.fullTextLink || "-"}</td>
              <td>{row.knowledgeMatch}</td>
              <td>{row.status}</td>
              {showDecision && <td>{row.decision || "-"}</td>}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}