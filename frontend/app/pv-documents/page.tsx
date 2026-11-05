import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import PvDocumentLibrary from "@/components/pv-documents/PvDocumentLibrary";
export default function PvDocumentsPage(){return <ApplicationShell module="PV_DOCUMENTATION"><OperationalScreenHeader compact eyebrow="NEXUS · PV Documents" title="PV Document Registry" description="Controlled documentation, version lineage and human approval." status="Governed"/><PvDocumentLibrary/></ApplicationShell>;}
