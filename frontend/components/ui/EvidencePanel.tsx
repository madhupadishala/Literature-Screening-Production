import s from "./data-primitives.module.css";
import { Badge } from "./Badge";
export function EvidencePanel({
  suggestion,
  source,
  reviewer,
  decision,
  finalized = false,
}: {
  suggestion: string;
  source: string;
  reviewer?: string;
  decision?: string;
  finalized?: boolean;
}) {
  return (
    <section
      className={s.evidence}
      data-finalized={finalized || undefined}
      aria-label="AI evidence and human decision"
    >
      <div className={s.evidenceAi}>
        <Badge tone="info">AI suggestion — not final</Badge>
        <p>{suggestion}</p>
        <small>Evidence: {source}</small>
      </div>
      <div className={s.evidenceHuman}>
        <Badge tone={finalized ? "success" : "warning"}>
          {finalized ? "Finalized human decision" : "Human review required"}
        </Badge>
        <p>{decision ?? "Awaiting reviewer"}</p>
        {reviewer ? <small>Reviewer: {reviewer}</small> : null}
      </div>
    </section>
  );
}
export default EvidencePanel;
