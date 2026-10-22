import ApplicationShell from "@/components/enterprise/ApplicationShell";
import HitsWorkspace from "@/components/nexus-hits-v2/HitsWorkspace";

export default function HitsPage() {
  return (
    <ApplicationShell module="LITERATURE">
      <HitsWorkspace />
    </ApplicationShell>
  );
}
