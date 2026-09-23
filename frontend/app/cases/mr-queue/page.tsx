import Navigation from "@/components/Navigation";
import { ReviewTaskQueue } from "@/components/nexus/OperationalQueue";

export default function CaseMrQueuePage() {
  return (
    <div className="app-shell">
      <Navigation />
      <div style={{ margin: -18 }}>
        <ReviewTaskQueue
          entityType="CASE"
          taskType="MEDICAL_REVIEW"
          title="Medical Review Queue"
          description="Cases awaiting Medical Review within the same Case Processing lifecycle."
        />
      </div>
    </div>
  );
}
