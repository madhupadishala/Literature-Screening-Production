import hashlib
import json

from . import config as K
from .audit import AuditLog
from .extraction import Extractor
from .ime import ImeList
from .lexical import scan
from .rules import Evidence, evaluate
from .schemas import CaseInput, Criterion, CriterionTrace, Decision, Finding
from .verification import quote_verified


def _consensus(findings: list[Finding], narrative: str) -> tuple[str, str | None]:
    if not findings:
        return "failed", None
    statuses = {f.status for f in findings}
    if statuses == {"present"}:
        if any(f.experiencer != "patient" for f in findings):
            return "other_experiencer", findings[0].quote
        if all(quote_verified(f.quote, narrative) for f in findings):
            return "present", findings[0].quote
        return "unverified", findings[0].quote
    if statuses == {"absent"}:
        return "absent", None
    if statuses == {"unknown"}:
        return "unknown", None
    return "disagree", None


def _explain(decision: str, met, reasons, reporter) -> str:
    if decision == "serious":
        parts = [c.value for c in met] or (["reporter assessment"] if reporter else [])
        return "Serious: " + ", ".join(parts) + "."
    if decision == "needs_review":
        return "Needs medical review: " + "; ".join(reasons) + "."
    return "No seriousness criterion present; all channels agree on absence."


class SeriousnessPipeline:
    def __init__(self, extractor: Extractor, audit: AuditLog, cfg: K.Config, ime: ImeList | None = None):
        self.extractor, self.audit, self.cfg = extractor, audit, cfg
        self.ime = ime or ImeList()

    def assess(self, case: CaseInput, tenant_id: str) -> Decision:
        narrative = case.narrative
        lex_hits = scan(narrative)

        samples, failures = [], 0
        for i in range(max(1, self.cfg.samples)):
            try:
                samples.append(self.extractor.extract(narrative, i))
            except Exception:
                failures += 1

        ime_terms = self.ime.match(case.event_terms)
        evidence: dict[Criterion, Evidence] = {}
        for c in Criterion:
            fs = [f for s in samples for f in s.findings if f.criterion == c]
            state, quote = _consensus(fs, narrative)
            evidence[c] = Evidence(
                llm_state=state, quote=quote,
                lexical_hits=[h.text for h in lex_hits if h.criterion == c and not h.negated],
                ime_terms=ime_terms if c == Criterion.MEDICALLY_IMPORTANT else [],
            )

        insufficient = (len(narrative.strip()) < self.cfg.min_narrative_chars
                        and not case.event_terms and not case.reporter_serious)
        res = evaluate(evidence, case.reporter_serious, insufficient, failures > 0)

        route, reasons = "auto", list(res.reasons)
        if res.decision == "needs_review":
            route = "hitl"
        elif res.decision == "non_serious" and not self.cfg.auto_non_serious:
            route = "hitl"
            reasons.append("non_serious_confirmation_required")

        trace = [CriterionTrace(criterion=c, llm_state=e.llm_state, quote=e.quote,
                                lexical_hits=e.lexical_hits, ime_terms=e.ime_terms,
                                met=c in res.met) for c, e in evidence.items()]
        versions = {"rule_pack": K.RULE_PACK_VERSION, "prompt": K.PROMPT_VERSION,
                    "lexicon": K.LEXICON_VERSION, "ime_list": self.ime.version,
                    "extractor": self.extractor.name, "model": self.cfg.model or "n/a"}
        decision = Decision(
            case_id=case.case_id, decision=res.decision, route=route, criteria_met=res.met,
            review_reasons=reasons, explanation=_explain(res.decision, res.met, reasons, case.reporter_serious),
            trace=trace, versions=versions,
            input_sha256=hashlib.sha256(narrative.encode()).hexdigest(),
        )
        # PHI minimization: audit stores hashes + decision, never the narrative.
        decision.audit_id = self.audit.append({"tenant": tenant_id, **json.loads(decision.model_dump_json())})
        return decision
