import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import AggregateDetail from "@/components/aggregate/AggregateDetail";
export default async function AggregateReportPage({params}:{params:Promise<{reportId:string}>}){
 const {reportId}=await params;
 return <ApplicationShell module="AGGREGATE_REPORTING">
  <OperationalScreenHeader compact eyebrow="NEXUS · Aggregate Reporting" title="Aggregate Report Authoring" description="Version-controlled sections, frozen source evidence and review history." status="Controlled report"/>
  <AggregateDetail id={reportId}/>
 </ApplicationShell>;
}
