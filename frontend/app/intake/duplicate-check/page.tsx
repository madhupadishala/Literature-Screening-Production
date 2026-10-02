import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import IntakeOperationalQueue from "@/components/intake/IntakeOperationalQueue";

export default function DuplicateCheckPage() {
  return (
    <ApplicationShell module="INTAKE">
      <OperationalScreenHeader
        eyebrow="Intake & Triage · Duplicate Check"
        title="Duplicate Check Queue"
        description="Review candidate case relationships before case creation or follow-up linkage. Human decisions and audit reasons remain authoritative."
        status="Controlled Intake workflow"
      />
      <IntakeOperationalQueue queue="DUPLICATE" />
    </ApplicationShell>
  );
}
