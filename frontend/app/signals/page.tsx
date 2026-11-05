import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import SignalWorklist from "@/components/signals/SignalWorklist";
export default function SignalsPage() {
  return <ApplicationShell module="SIGNAL_MANAGEMENT">
    <OperationalScreenHeader compact eyebrow="NEXUS · Signal Management" title="Signal Management" description="Controlled signal tracking, provenance and authorized assessment." status="Human governed"/>
    <SignalWorklist/>
  </ApplicationShell>;
}
