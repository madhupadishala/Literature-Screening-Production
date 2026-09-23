import Navigation from "@/components/Navigation";
import CaseDuplicateGate from "@/components/nexus/CaseDuplicateGate";

export default function CaseDuplicateCheckPage() {
  return (
    <div className="app-shell">
      <Navigation />
      <div style={{ margin: -18 }}>
        <CaseDuplicateGate />
      </div>
    </div>
  );
}
