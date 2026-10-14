"""AG16 - AESI & Special Situations Assessment Agent.

Flags adverse events of special interest (configurable list) and GVP Module VI
special situations (pregnancy/breastfeeding exposure, overdose, misuse, medication
error, off-label use, occupational exposure, lack of efficacy, interaction,
infectious-agent transmission, quality issues). Negated mentions are not flagged.

Context options:
  aesi_categories: list[str]            restrict to these AESI categories
  aesi_extra_terms: dict[str, list[str]] product-specific terms per category
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from Agentic_AI.shared.recovered_ag_agents.base import BaseAgent, Draft, Evidence, evidence_from_span, find_evidence, load_config
from Agentic_AI.shared.recovered_ag_agents.patterns import is_negated


def _term_regex(term: str) -> re.Pattern:
    body = r"[\s-]+".join(re.escape(p) for p in re.split(r"[\s-]+", term))
    flags = 0 if (term.isupper() and len(term) <= 5) else re.I
    return re.compile(r"(?<![A-Za-z])%s(?![A-Za-z])" % body, flags)


class AesiSpecialSituationsAgent(BaseAgent):
    agent_id = "AG16"
    name = "AESI & Special Situations Assessment Agent"

    def __init__(self, llm=None, review_threshold: float = 0.75) -> None:
        super().__init__(llm, review_threshold)
        cfg = load_config("aesi_special_situations.json")
        self.aesi_terms: Dict[str, List[str]] = cfg["aesi"]
        self.situations: Dict[str, Dict[str, Any]] = {
            k: {**v, "rx": re.compile(v["pattern"], re.I)}
            for k, v in cfg["special_situations"].items()
        }

    def _aesi_lists(self, context: Dict[str, Any]) -> Dict[str, List[str]]:
        lists = {k: list(v) for k, v in self.aesi_terms.items()}
        for cat, terms in (context.get("aesi_extra_terms") or {}).items():
            lists.setdefault(cat, []).extend(terms)
        only = context.get("aesi_categories")
        return {k: v for k, v in lists.items() if not only or k in only}

    def deterministic(self, text: str, context: Dict[str, Any]) -> Draft:
        aesi, negated, situations, evidence = [], [], [], []
        for cat, terms in self._aesi_lists(context).items():
            seen_spans = set()
            for term in terms:
                for m in _term_regex(term).finditer(text):
                    if any(m.start() < e and s < m.end() for s, e in seen_spans):
                        continue
                    seen_spans.add((m.start(), m.end()))
                    entry = {"category": cat, "term": m.group(0), "source": "rule"}
                    if is_negated(text, m.start(), m.end()):
                        negated.append(entry)
                        continue
                    aesi.append(entry)
                    evidence.append(evidence_from_span(text, m.start(), m.end(), f"aesi:{cat}"))
        low_only = True
        for key, spec in self.situations.items():
            for m in spec["rx"].finditer(text):
                if is_negated(text, m.start(), m.end()):
                    negated.append({"category": key, "term": m.group(0), "source": "rule"})
                    continue
                situations.append({"type": key, "term": m.group(0), "source": "rule",
                                   "follow_up": spec.get("follow_up")})
                evidence.append(evidence_from_span(text, m.start(), m.end(), f"situation:{key}"))
                if not spec.get("low_precision"):
                    low_only = False
                break  # one hit per situation type is enough
        flagged = bool(aesi or situations)
        reasons: List[str] = []
        conf = 0.85 if flagged else 0.8
        if situations and low_only and not aesi:
            conf = 0.7
            reasons.append("Only low-precision special-situation patterns matched; reviewer to confirm.")
        data = self._data(aesi, situations, negated)
        return Draft("FLAGGED" if flagged else "NONE_DETECTED", data, evidence, conf, reasons)

    @staticmethod
    def _data(aesi, situations, negated) -> Dict[str, Any]:
        return {
            "aesi": aesi,
            "special_situations": situations,
            "negated_mentions": negated,
            "any_aesi": bool(aesi),
            "any_special_situation": bool(situations),
            "follow_up_suggested": sorted({s["follow_up"] for s in situations if s.get("follow_up")}),
            "aesi_categories_hit": sorted({a["category"] for a in aesi}),
            "special_situation_types_hit": sorted({s["type"] for s in situations}),
        }

    # ------------------------------------------------------------ LLM pass
    def llm_prompt(self, text: str, context: Dict[str, Any]) -> Tuple[str, str]:
        cats = ", ".join(self._aesi_lists(context))
        sits = ", ".join(self.situations)
        system = (
            "You assess pharmacovigilance text for adverse events of special interest and "
            'special situations. Return ONLY JSON: {"aesi":[{"category":str,"term":str,"quote":str}],'
            '"special_situations":[{"type":str,"quote":str}]}. '
            f"Allowed AESI categories: {cats}. Allowed special situation types: {sits}. "
            '"quote" must be verbatim from the text. Do not report negated or ruled-out events.'
        )
        return system, text

    def reconcile(self, text, context, draft: Draft, payload, notes) -> Draft:
        aesi, situations = draft.data["aesi"], draft.data["special_situations"]
        allowed = set(self._aesi_lists(context))
        hit_cats = {a["category"] for a in aesi}
        hit_types = {s["type"] for s in situations}
        for raw in payload.get("aesi") or []:
            ev = find_evidence(text, raw.get("quote"), f"aesi:{raw.get('category')}") if isinstance(raw, dict) else None
            if ev is None or raw.get("category") not in allowed:
                notes.append("Discarded LLM AESI item: ungrounded quote or unknown category.")
                continue
            if raw["category"] in hit_cats:
                continue
            aesi.append({"category": raw["category"], "term": raw.get("term"), "source": "llm"})
            draft.evidence.append(ev)
            hit_cats.add(raw["category"])
            draft.review_reasons.append(f"LLM-only AESI finding needs confirmation: {raw['category']}")
        for raw in payload.get("special_situations") or []:
            ev = find_evidence(text, raw.get("quote"), f"situation:{raw.get('type')}") if isinstance(raw, dict) else None
            if ev is None or raw.get("type") not in self.situations:
                notes.append("Discarded LLM special-situation item: ungrounded quote or unknown type.")
                continue
            if raw["type"] in hit_types:
                continue
            situations.append({"type": raw["type"], "term": None, "source": "llm",
                               "follow_up": self.situations[raw["type"]].get("follow_up")})
            draft.evidence.append(ev)
            hit_types.add(raw["type"])
            draft.review_reasons.append(f"LLM-only special situation needs confirmation: {raw['type']}")
        draft.data = self._data(aesi, situations, draft.data["negated_mentions"])
        draft.status = "FLAGGED" if (aesi or situations) else "NONE_DETECTED"
        return draft
