import Navigation from "@/components/Navigation";
import { ReviewTaskQueue } from "@/components/nexus/OperationalQueue";

export default function IntakeMrQueuePage() {
  return (
    <div className="app-shell">
      <Navigation />
      <div style={{ margin: -18 }}>
        <ReviewTaskQueue
          entityType="INTAKE_RECORD"
          taskType="MEDICAL_REVIEW"
          title="Medical Review Queue"
          description="Medical Review is a lifecycle stage within Intake & Triage, not a separate Nexus module."
        />
      </div>
    </div>
  );
}
