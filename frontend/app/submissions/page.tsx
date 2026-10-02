import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import OperationalState from "@/components/enterprise/OperationalState";

export default function SubmissionsPage() {
  return (
    <ApplicationShell>
      <OperationalScreenHeader
        eyebrow="Safety Operations · Submissions"
        title="Submissions Workspace"
        description="Prepare, track, and govern finalized safety cases for downstream regulatory submission workflows."
        status="Foundation available"
      />

      <OperationalState
        kind="info"
        title="Submission operations foundation is available"
        message="Submission preparation, governed transport, acknowledgement tracking, reconciliation, and history will be surfaced here as operational screens are reconciled."
      />

    </ApplicationShell>
  );
}