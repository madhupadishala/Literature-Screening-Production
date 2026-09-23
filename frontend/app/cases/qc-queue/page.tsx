import Navigation from "@/components/Navigation";
import { ReviewTaskQueue } from "@/components/nexus/OperationalQueue";

export default function CaseQcQueuePage() {
  return (
    <div className="app-shell">
      <Navigation />
      <div style={{ margin: -18 }}>
        <ReviewTaskQueue
          entityType="CASE"
          taskType="QC"
          title="QC Queue"
          description="Cases awaiting independent QC within the Case Processing lifecycle."
        />
      </div>
    </div>
  );
}
