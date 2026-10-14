"""AG27 - Patient vs. Aggregate Relevance Assessment Agent.

Routes a source document as INDIVIDUAL_CASE (ICSR handling), AGGREGATE_ONLY
(periodic/aggregate safety review), BOTH or NOT_RELEVANT, from study design,
patient-level identifiers and aggregate adverse-event reporting.

Context options:
  icsr_validity: dict   AG25 result ("status"); NOT_VALID suppresses INDIVIDUAL_CASE
                        and adds a review reason instead of silently overriding.

This routes records; it does not replace a regulatory determination.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from Agentic_AI.shared.recovered_ag_agents.base import BaseAgent, Draft, Evidence, evidence_from_span, find_evidence, load_config
from Agentic_AI.shared.recovered_ag_agents.patterns import patient_indicators, sentence_bounds

_HUMAN_DESIGNS = ("meta_analysis", "rct", "clinical_trial_other", "case_report",
                  "case_series", "cohort_observational")


class PatientAggregateRelevanceAgent(BaseAgent):
    agent_id = "AG27"
    name = "Patient vs. Aggregate Relevance Assessment Agent"

    def __init__(self, llm=None, review_threshold: float = 0.75) -> None:
        super().__init__(llm, review_threshold)
        cfg = load_config("study_design.json")
        self.designs = [{**d, "rx": re.compile(d["pattern"], re.I)} for d in cfg["designs"]]
        self.agg_rx = re.compile(cfg["aggregate_ae_pattern"], re.I)
        self.ae_rx = re.compile(cfg["ae_word_pattern"], re.I)

    # ------------------------------------------------------------ helpers
    def _detect_design(self, text: str):
        matched: Dict[str, Any] = {}
        for d in self.designs:
            m = d["rx"].search(text)
            if m:
                matched[d["name"]] = (d, m)
        human = [n for n in _HUMAN_DESIGNS if n in matched]
        primary = human[0] if human else next(
            (n for n in ("non_clinical", "review_narrative") if n in matched), "unknown")
        return primary, matched

    def _aggregate_sentences(self, text: str) -> List[Tuple[int, int]]:
        spans, seen = [], set()
        for m in self.agg_rx.finditer(text):
            s, e = sentence_bounds(text, m.start(), m.end())
            if (s, e) in seen:
                continue
            if self.ae_rx.search(text, s, e):
                seen.add((s, e))
                spans.append((s, e))
        return spans

    # ------------------------------------------------------------ rule pass
    def deterministic(self, text: str, context: Dict[str, Any]) -> Draft:
        primary, matched = self._detect_design(text)
        inds = patient_indicators(text)
        agg = self._aggregate_sentences(text)
        evidence: List[Evidence] = []
        rationale: List[str] = [f"Primary design: {primary}"]
        reasons: List[str] = []

        if primary in matched:
            _, m = matched[primary]
            evidence.append(evidence_from_span(text, m.start(), m.end(), "design", whole_sentence=False))
        for i in inds[:2]:
            evidence.append(evidence_from_span(text, i["start"], i["end"], "patient_indicator", whole_sentence=False))
        for s, e in agg[:2]:
            evidence.append(Evidence(text[s:e].strip(), s, e, "aggregate_ae"))

        individual = bool(inds) and primary in ("case_report", "case_series", "cohort_observational",
                                                "rct", "clinical_trial_other", "unknown")
        if primary in ("case_report", "case_series") and not inds:
            individual = False
            reasons.append("Case-report language but no patient-level identifiers found.")
        aggregate = bool(agg) or (primary == "case_series" and bool(inds))
        if primary in ("non_clinical", "review_narrative") and not inds and not agg:
            individual = aggregate = False
        if primary == "non_clinical" and (inds or agg):
            reasons.append("Non-clinical design wording alongside human indicators; verify study type.")

        validity = (context.get("icsr_validity") or {}).get("status")
        if validity == "NOT_VALID" and individual:
            individual = False
            rationale.append("AG25 reported NOT_VALID, so individual-case routing is withheld pending review.")
            reasons.append("AG25 NOT_VALID conflicts with patient-level indicators; confirm validity first.")

        rationale.append(f"Patient-level identifiers: {len(inds)}")
        rationale.append(f"Aggregate adverse-event statements: {len(agg)}")
        classification = (
            "BOTH" if individual and aggregate else
            "INDIVIDUAL_CASE" if individual else
            "AGGREGATE_ONLY" if aggregate else
            "NOT_RELEVANT"
        )
        conf = 0.85
        if primary == "unknown":
            conf = 0.5
            reasons.append("Study design could not be determined from text.")
        elif classification == "NOT_RELEVANT" and primary in _HUMAN_DESIGNS:
            conf = 0.65
            reasons.append("Human-study design but no safety data detected; confirm not relevant.")
        data = {
            "classification": classification,
            "individual_case_relevant": individual,
            "aggregate_relevant": aggregate,
            "study_design": primary,
            "designs_detected": sorted(matched),
            "patient_indicator_count": len(inds),
            "aggregate_statement_count": len(agg),
            "rationale": rationale,
        }
        return Draft(classification, data, evidence, conf, reasons)

    # ------------------------------------------------------------ LLM pass
    def llm_prompt(self, text: str, context: Dict[str, Any]) -> Tuple[str, str]:
        names = ", ".join(d["name"] for d in self.designs)
        system = (
            "Identify the study design of this pharmacovigilance source text. Return ONLY JSON: "
            f'{{"design":str,"quote":str}} where design is one of: {names}. '
            '"quote" must be verbatim from the text and show the design.'
        )
        return system, text

    def reconcile(self, text, context, draft: Draft, payload, notes) -> Draft:
        design = payload.get("design")
        ev = find_evidence(text, payload.get("quote"), "design")
        valid_names = {d["name"] for d in self.designs}
        if design not in valid_names or ev is None:
            notes.append("Discarded LLM design: unknown design or ungrounded quote.")
            return draft
        current = draft.data["study_design"]
        if current == "unknown":
            draft.data["llm_design_suggestion"] = design
            draft.evidence.append(ev)
            draft.review_reasons.append(
                f"Rules could not determine design; LLM suggests '{design}' (grounded). Classification unchanged; confirm.")
            return draft
        if design != current:
            draft.review_reasons.append(f"LLM design '{design}' differs from rule design '{current}'; confirm.")
        return draft
