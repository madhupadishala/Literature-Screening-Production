import Navigation from "@/components/Navigation";
import { IntakeStageQueue } from "@/components/nexus/OperationalQueue";

export default function IntakeTriageQueuePage() {
  return (
    <div className="app-shell">
      <Navigation />
      <div style={{ margin: -18 }}>
        <IntakeStageQueue stage="triage" />
      </div>
    </div>
  );
}
