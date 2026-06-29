export default function TopBar() {
  return (
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
  );
}
