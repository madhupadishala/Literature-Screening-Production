"""AG25 - ICSR Validity Assessment Agent.

Checks the four minimum ICSR criteria (GVP Module VI): identifiable patient,
identifiable reporter, suspect product, adverse event.

Context options:
  source_type: "literature" | "spontaneous" | "clinical_trial" | other
  authors:     list[str]  named publication authors (literature reporter)
  products:    list[str]  Product Master names/synonyms (source-exact matching)
  events:      list[str]  known event terms (optional)

Governance: NOT_VALID is never final - it always requires human confirmation,
so no case is discarded automatically.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from Agentic_AI.shared.recovered_ag_agents.base import BaseAgent, Draft, Evidence, evidence_from_span, find_evidence, load_config
from Agentic_AI.shared.recovered_ag_agents.patterns import is_negated, patient_indicators

_REPORTER = re.compile(
    r"\b(?:Dr\.?|physician|doctor|pharmacist|nurse|consumer|healthcare professional|"
    r"health care professional|investigator|surgeon|clinician|reported by|lawyer)\b", re.I)
_EVENT_CUE = re.compile(
    r"\b(?:developed|experienced|presented with|suffered|complicated by|diagnosed with|"
    r"adverse (?:event|reaction|effect|drug reaction)s?|reaction|toxicity|injury)\b", re.I)
_PRODUCT_CUE = re.compile(
    r"\b(?:treated with|received|administered|taking|started on|prescribed|given|"
    r"therapy with|treatment with)\s+(?P<drug>[A-Z][\w-]+)")
_CRITERIA = ("patient", "reporter", "product", "event")
_FOLLOW_UP = {
    "patient": "Patient identifier (age/age group, sex, initials or ID)",
    "reporter": "Identifiable reporter (name/qualification/contact)",
    "product": "Suspect product name",
    "event": "Adverse event description",
}


class IcsrValidityAgent(BaseAgent):
    agent_id = "AG25"
    name = "ICSR Validity Assessment Agent"

    def __init__(self, llm=None, review_threshold: float = 0.75) -> None:
        super().__init__(llm, review_threshold)
        self._aesi = load_config("aesi_special_situations.json")["aesi"]

    # ------------------------------------------------------------ criteria
    def _patient(self, text: str):
        inds = patient_indicators(text)
        ev = [evidence_from_span(text, i["start"], i["end"], "patient", whole_sentence=False) for i in inds[:3]]
        return bool(inds), sorted({i["kind"] for i in inds}), ev, 0.9

    def _reporter(self, text: str, ctx: Dict[str, Any]):
        authors = [a for a in (ctx.get("authors") or []) if isinstance(a, str) and a.strip()]
        if ctx.get("source_type") == "literature" and authors:
            return True, ["named_publication_author"], [], 0.9
        m = _REPORTER.search(text)
        if m:
            return True, ["reporter_role_in_text"], [evidence_from_span(text, m.start(), m.end(), "reporter")], 0.8
        return False, [], [], 0.85

    def _product(self, text: str, ctx: Dict[str, Any]):
        for name in ctx.get("products") or []:
            m = re.search(r"(?<![A-Za-z])%s(?![A-Za-z])" % re.escape(name), text, re.I)
            if m:
                return True, ["product_master_match"], [evidence_from_span(text, m.start(), m.end(), "product")], 0.9
        if not ctx.get("products"):
            m = _PRODUCT_CUE.search(text)
            if m:
                return True, ["unverified_product_cue"], [evidence_from_span(text, m.start(), m.end(), "product")], 0.65
        return False, [], [], 0.85

    def _event(self, text: str, ctx: Dict[str, Any]):
        for term in ctx.get("events") or []:
            m = re.search(r"(?<![A-Za-z])%s(?![A-Za-z])" % re.escape(term), text, re.I)
            if m and not is_negated(text, m.start(), m.end()):
                return True, ["supplied_event_term"], [evidence_from_span(text, m.start(), m.end(), "event")], 0.9
        for cat, terms in self._aesi.items():
            for term in terms:
                m = re.search(r"(?<![A-Za-z])%s(?![A-Za-z])" % re.escape(term), text, re.I)
                if m and not is_negated(text, m.start(), m.end()):
                    return True, ["known_event_term"], [evidence_from_span(text, m.start(), m.end(), "event")], 0.85
        for m in _EVENT_CUE.finditer(text):
            if not is_negated(text, m.start(), m.end()):
                return True, ["event_cue_phrase"], [evidence_from_span(text, m.start(), m.end(), "event")], 0.65
        return False, [], [], 0.85

    # ------------------------------------------------------------ rule pass
    def deterministic(self, text: str, context: Dict[str, Any]) -> Draft:
        results = {
            "patient": self._patient(text),
            "reporter": self._reporter(text, context),
            "product": self._product(text, context),
            "event": self._event(text, context),
        }
        return self._build(results, context)

    def _build(self, results, context) -> Draft:
        criteria, evidence, confs, reasons = {}, [], [], []
        for name in _CRITERIA:
            met, basis, ev, conf = results[name]
            criteria[name] = {"met": met, "basis": basis}
            evidence.extend(ev)
            confs.append(conf)
            if met and conf < 0.75:
                reasons.append(f"{name}: weak basis ({', '.join(basis)}); verify against source/Product Master.")
        missing = [n for n in _CRITERIA if not criteria[n]["met"]]
        valid = not missing
        if not valid:
            reasons.append("NOT_VALID determinations require human confirmation; no case is discarded automatically.")
        data = {
            "criteria": criteria,
            "missing_criteria": missing,
            "follow_up_fields": [_FOLLOW_UP[m] for m in missing],
            "source_type": context.get("source_type"),
        }
        return Draft("VALID" if valid else "NOT_VALID", data, evidence, min(confs), reasons)

    # ------------------------------------------------------------ LLM pass
    def llm_prompt(self, text: str, context: Dict[str, Any]) -> Tuple[str, str]:
        system = (
            "Assess the four minimum ICSR criteria. Return ONLY JSON: "
            '{"patient":{"met":bool,"quote":str},"reporter":{"met":bool,"quote":str},'
            '"product":{"met":bool,"quote":str},"event":{"met":bool,"quote":str}}. '
            '"quote" must be verbatim from the text for every criterion marked met.'
        )
        return system, text

    def reconcile(self, text, context, draft: Draft, payload, notes) -> Draft:
        criteria = draft.data["criteria"]
        for name in _CRITERIA:
            raw = payload.get(name)
            if not isinstance(raw, dict):
                continue
            llm_met = bool(raw.get("met"))
            ev = find_evidence(text, raw.get("quote"), name) if llm_met else None
            if llm_met and ev is None:
                notes.append(f"Discarded LLM '{name}' claim: quote not found in source.")
                continue
            if llm_met and not criteria[name]["met"]:
                criteria[name] = {"met": True, "basis": ["llm_grounded"]}
                draft.evidence.append(ev)
                draft.review_reasons.append(f"{name}: rule pass missed it, LLM found grounded evidence; confirm.")
            elif not llm_met and criteria[name]["met"]:
                draft.review_reasons.append(f"{name}: LLM disagrees with rule pass; rule evidence retained, confirm.")
        missing = [n for n in _CRITERIA if not criteria[n]["met"]]
        draft.data["missing_criteria"] = missing
        draft.data["follow_up_fields"] = [_FOLLOW_UP[m] for m in missing]
        draft.status = "VALID" if not missing else "NOT_VALID"
        if missing:
            draft.review_reasons.append("NOT_VALID determinations require human confirmation; no case is discarded automatically.")
        return draft
