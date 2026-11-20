import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import AggregateWorklist from "@/components/aggregate/AggregateWorklist";
export default function AggregateReportsPage(){
 return <ApplicationShell module="AGGREGATE_REPORTING">
  <OperationalScreenHeader compact eyebrow="NEXUS · Aggregate Reporting" title="Aggregate Safety Reporting" description="Frozen scoped source snapshots, controlled versioning and human approval." status="Human governed"/>
  <AggregateWorklist/>
 </ApplicationShell>;
}
