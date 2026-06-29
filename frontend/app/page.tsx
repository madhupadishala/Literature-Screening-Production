import Module from "@/components/Module";
import Navigation from "@/components/Navigation";
import StatusStrip from "@/components/StatusStrip";
import TopBar from "@/components/TopBar";

const statusTabs = [
  { label: "Search Job", value: "Ready", active: true },
  { label: "Knowledge", value: "Loaded" },
  { label: "Template", value: "Configured" },
  { label: "Queue", value: "0" },
];

export default function Home() {
  return (
    <main className="cx-app">
      <TopBar />
      <Navigation />

      <StatusStrip items={statusTabs} />

      <Module title="Search Configuration" tone="search">
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
      </Module>

      <Module
        title="Pipeline Queue"
        tone="pipeline"
        rightText="0 article(s) in Hits queue · Next: Screening Workspace"
      >
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
      </Module>
    </main>
  );
}
