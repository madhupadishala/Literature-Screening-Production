import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import {Notice} from "@/components/ui/Notice";
import {Card} from "@/components/ui/Card";
export default function MiccPage(){
 return <ApplicationShell>
  <OperationalScreenHeader compact eyebrow="NEXUS · MICC" title="Medical Information Contact Centre"
    description="Inquiry intake, medical responses and safety escalation require a governed MICC service." status="Backend not provisioned"/>
  <Notice tone="warning">No MICC module entitlement, scoped inquiry/response API or response approval service is available in this repository. Inquiry creation, SLA attribution, response generation and case escalation are disabled until governed backend contracts are implemented and qualified.</Notice>
  <Card><strong>Governance boundary</strong><p>Do not record an inquiry or draft a medical response using unsecured browser storage or an unrelated PV service. Existing literature, safety intake and case-processing workflows remain available through their own authorized modules.</p></Card>
 </ApplicationShell>;
}
