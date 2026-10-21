import ApplicationShell from "@/components/enterprise/ApplicationShell";
import HitsWorkspace from "@/components/nexus-hits-v2/HitsWorkspace";
import LegacyHitsPage from "@/components/legacy-hits/LegacyHitsPage";
import { isHitsFrsPreviewEnabled } from "@/lib/features/hits-frs-preview";

export default function HitsPage() {
  if (!isHitsFrsPreviewEnabled()) {
    return <LegacyHitsPage />;
  }
  return (
    <ApplicationShell module="LITERATURE">
      <HitsWorkspace />
    </ApplicationShell>
  );
}
