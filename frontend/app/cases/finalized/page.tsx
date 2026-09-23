import Navigation from "@/components/Navigation";
import CaseQueueView from "@/components/nexus/CaseQueueView";

export default function FinalizedCasesPage() {
  return (
    <div className="app-shell">
      <Navigation />
      <div style={{ margin: -18 }}>
        <CaseQueueView mode="finalized" />
      </div>
    </div>
  );
}
