import Navigation from "@/components/Navigation";
import IntakeLifecycleReviewClient from "./review-client";

export default function IntakeLifecycleReviewPage() {
  return (
    <main className="app-shell" id="main-content">
      <Navigation />
      <IntakeLifecycleReviewClient />
    </main>
  );
}
