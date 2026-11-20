import ApplicationShell from "@/components/enterprise/ApplicationShell";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import AdHocSearchWorkspace from "@/components/literature/AdHocSearchWorkspace";

export default function LiteratureSearchPage() {
  return (
    <ApplicationShell module="LITERATURE">
      <InvestorDemoHeader
        eyebrow="RBAC-CONTROLLED SEARCH UTILITY"
        title="Enterprise Literature Search"
        subtitle="Use this surface either for non-production testing / validation or for an explicitly declared manual production search. Test searches remain outside the PV workflow unless a selected article is deliberately promoted to Hits."
        status="Execution purpose must be explicit"
      />
      <AdHocSearchWorkspace />
    </ApplicationShell>
  );
}
