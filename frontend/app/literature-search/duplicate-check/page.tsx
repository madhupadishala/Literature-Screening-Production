import Navigation from "@/components/Navigation";
import DuplicateDetectionPanel from "@/components/literature/duplicates/DuplicateDetectionPanel";

export default function LiteratureDuplicateCheckPage() {
  return (
    <main className="app-shell" id="main-content">
      <Navigation />
      <section style={{ margin: "4px 2px 14px" }}>
        <span style={{ color: "#0f6db7", fontSize: 9, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>
          Literature Screening · Entry Gate
        </span>
        <h1 style={{ margin: "3px 0 0", color: "#102a43", fontSize: 26, letterSpacing: "-.035em" }}>
          Publication Duplicate Check
        </h1>
        <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 11 }}>
          PMID, DOI and canonical publication identity are assessed before an article advances through the screening lifecycle.
        </p>
      </section>
      <DuplicateDetectionPanel />
    </main>
  );
}
