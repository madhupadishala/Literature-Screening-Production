import Navigation from "@/components/Navigation";
import CaseQueueView from "@/components/nexus/CaseQueueView";

export default function CaseProcessingQueuePage() {
  return (
    <div className="app-shell">
      <Navigation />
      <div style={{ margin: -18 }}>
        <CaseQueueView mode="processing" />
      </div>
    </div>
  );
}
