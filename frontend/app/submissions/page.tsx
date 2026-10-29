import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import SubmissionWorkspace from "./SubmissionWorkspace";

export default function SubmissionsPage() {
  return (
    <ApplicationShell module="SUBMISSIONS">
      <OperationalScreenHeader
        eyebrow="Safety Operations · Submissions"
        title="ICSR Submissions Workspace"
        description="Prepare immutable case versions, run controlled preflight checks, and review transmission and acknowledgement history."
        status="Integrated · transmission locked"
      />
      <SubmissionWorkspace />
    </ApplicationShell>
  );
}
