import Navigation from "@/components/Navigation";
import { ReviewTaskQueue } from "@/components/nexus/OperationalQueue";

export default function IntakeQcQueuePage() {
  return (
    <div className="app-shell">
      <Navigation />
      <div style={{ margin: -18 }}>
        <ReviewTaskQueue
          entityType="INTAKE_RECORD"
          taskType="QC"
          title="QC Queue"
          description="Independent QC review for completed Intake & Triage assessments before Medical Review."
        />
      </div>
    </div>
  );
}
