import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import PvDocumentDetail from "@/components/pv-documents/PvDocumentDetail";
export default async function PvDocumentPage({params}:{params:Promise<{documentId:string}>}){const {documentId}=await params;return <ApplicationShell module="PV_DOCUMENTATION"><OperationalScreenHeader compact eyebrow="NEXUS · PV Documents" title="Document Version Control" description="Source-linked content and audited lifecycle decisions." status="Human governed"/><PvDocumentDetail id={documentId}/></ApplicationShell>;}
