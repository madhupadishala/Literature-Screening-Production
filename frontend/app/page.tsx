const navItems = [
  "Mission Control",
  "Search",
  "Screening",
  "Intake",
  "Quality",
  "Reporting",
  "Audit",
  "Admin",
];

const statusTabs = [
  { label: "Search Job", value: "Ready", active: true },
  { label: "Knowledge", value: "Loaded" },
  { label: "Template", value: "Configured" },
  { label: "Queue", value: "0" },
];

export default function Home() {
  return (
    <main className="cx-app">
      <header className="cx-topbar">
        <div className="cx-brand-block">
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
          <button key={item} className={item === "Search" ? "active" : ""}>
            {item}
          </button>
        ))}
      </nav>

      <section className="cx-status-strip">
        {statusTabs.map((tab) => (
          <div key={tab.label} className={`cx-status-tab ${tab.active ? "active" : ""}`}>
            <span>{tab.label}</span>
            <b>{tab.value}</b>
          </div>
        ))}
      </section>

      <section className="cx-module">
        <div className="cx-ribbon cx-ribbon-search" />
        <div className="cx-module-title">Search Configuration</div>

        <div className="cx-search-grid">
          <div className="cx-field-group cx-query">
            <label>Boolean Search String</label>
            <textarea placeholder='paracetamol AND ("adverse event" OR toxicity)' />
          </div>

          <div className="cx-field-group">
            <label>Product</label>
            <input placeholder="Paracetamol" />

            <label>Product ID</label>
            <input placeholder="PID-001" />

            <label>Source</label>
            <select defaultValue="PubMed">
              <option>PubMed</option>
            </select>
          </div>

          <div className="cx-field-group">
            <label>Maximum PMIDs</label>
            <select defaultValue="50">
              <option>20</option>
              <option>50</option>
              <option>100</option>
              <option>250</option>
              <option>500</option>
            </select>

            <div className="cx-kv">
              <div><span>Mode</span><b>Assisted</b></div>
              <div><span>Template</span><b>Configured</b></div>
              <div><span>QC Handoff</span><b>Enabled</b></div>
            </div>

            <button className="cx-execute">▶ Execute</button>
          </div>
        </div>
      </section>

      <section className="cx-module">
        <div className="cx-ribbon cx-ribbon-pipeline" />

        <div className="cx-module-title cx-spread">
          <span>Pipeline Queue</span>
          <small>0 article(s) in Hits queue · Next: Screening Workspace</small>
        </div>

        <table className="cx-table">
          <thead>
            <tr>
              <th>PMID</th>
              <th>Title</th>
              <th>Product</th>
              <th>Company Suspect</th>
              <th>Stage</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7} className="cx-empty">empty</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}