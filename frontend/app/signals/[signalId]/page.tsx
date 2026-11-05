import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import SignalDetail from "@/components/signals/SignalDetail";
export default async function SignalDetailPage({params}:{params:Promise<{signalId:string}>}) {
  const {signalId}=await params;
  return <ApplicationShell module="SIGNAL_MANAGEMENT">
    <OperationalScreenHeader compact eyebrow="NEXUS · Signal Management" title="Signal Assessment" description="Evidence-first signal review and auditable human decisions." status="Controlled assessment"/>
    <SignalDetail id={signalId}/>
  </ApplicationShell>;
}
