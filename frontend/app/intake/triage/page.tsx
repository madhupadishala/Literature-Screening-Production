import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import IntakeOperationalQueue from "@/components/intake/IntakeOperationalQueue";

export default function TriagePage() {
  return (
    <ApplicationShell module="INTAKE">
      <OperationalScreenHeader
        eyebrow="Intake & Triage · Triage"
        title="Triage Queue"
        description="Review validity, seriousness, priority, special situations and routing using the existing governed record workflow."
        status="Controlled Intake workflow"
      />
      <IntakeOperationalQueue queue="TRIAGE" />
    </ApplicationShell>
  );
}
