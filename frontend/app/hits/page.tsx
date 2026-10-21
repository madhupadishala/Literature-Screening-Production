import ApplicationShell from "@/components/enterprise/ApplicationShell";
import HitsWorkspace from "@/src/components/nexus-hits-v2/HitsWorkspace";
import LegacyHitsPage from "./legacy-page";
import { isHitsFrsPreviewEnabled } from "@/lib/features/hits-frs-preview";

/**
 * Feature-gated approved FRS Hits preview.
 * The application-wide AuthGate remains in app/layout.tsx.
 * Browser-memory-only simulated data; no API calls in HitsWorkspace.
 * On every other branch/environment, render the legacy authenticated page.
 */
export default function HitsPage() {
  if (!isHitsFrsPreviewEnabled()) return <LegacyHitsPage />;
  return <ApplicationShell module="LITERATURE"><HitsWorkspace /></ApplicationShell>;
}
