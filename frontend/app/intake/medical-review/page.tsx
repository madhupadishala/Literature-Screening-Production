import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import OperationalState from "@/components/enterprise/OperationalState";
import IntakeOperationalQueue from "@/components/intake/IntakeOperationalQueue";

export default function MedicalReviewPage() {
  return (
    <ApplicationShell module="INTAKE">
      <OperationalScreenHeader
        eyebrow="Intake & Triage · Medical Review"
        title="Medical Review Oversight"
        description="Operational view of governed Intake review status before downstream disposition."
        status="Review controlled"
      />
      <OperationalState
        kind="info"
        title="Single governed decision path"
        message="Record actions continue through the existing Intake/Triage workspace and server-side controls. This page is an oversight worklist, not a second mutation path."
        compact
      />
      <IntakeOperationalQueue queue="MEDICAL_REVIEW" />
    </ApplicationShell>
  );
}
