"""AG07 - Laboratory Data Extraction Agent.

Extracts test name, value, unit, reference range / ULN, abnormality flag and
date from PV source text. Rules first; optional LLM findings are accepted only
when they quote the source verbatim.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from Agentic_AI.shared.recovered_ag_agents.base import (BaseAgent, Draft, Evidence, evidence_from_span, find_evidence,
                   load_config)
from Agentic_AI.shared.recovered_ag_agents.patterns import sentence_bounds

_MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"
_DATE = re.compile(
    r"\b\d{4}-\d{2}-\d{2}\b"
    r"|\b\d{1,2}[-/ ](?:%s)[a-z]*[-/ ,]*\d{2,4}\b"
    r"|\b\d{1,2}/\d{1,2}/\d{2,4}\b"
    r"|\bday\s+\d+\b" % _MONTHS,
    re.I,
)
_REF = re.compile(
    r"(?:ref(?:erence)?\.?(?:\s*(?:range|interval|limits?))?|normal(?:\s*range)?|\bnr\b|\brr\b)"
    r"\s*[:=]?\s*(?P<lo>\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(?P<hi>\d+(?:\.\d+)?)",
    re.I,
)
_ULN = re.compile(r"\bULN\s*[:=]?\s*(?P<uln>\d+(?:\.\d+)?)", re.I)
_WINDOW_CUT = re.compile(r";|\n|\.\s+(?=[A-Z])")
_TIME_WORDS = re.compile(
    r"^\s*(?:weeks?|days?|months?|years?|hours?|hrs?|minutes?|mins?|times?|doses?|"
    r"mg\b|ml\b|patients?|cases?)", re.I)
_THOUSANDS = re.compile(r"^\d{1,3},\d{3}$")


class LabExtractionAgent(BaseAgent):
    agent_id = "AG07"
    name = "Laboratory Data Extraction Agent"

    def __init__(self, llm=None, review_threshold: float = 0.75) -> None:
        super().__init__(llm, review_threshold)
        cfg = load_config("lab_tests.json")
        self.tests: Dict[str, Any] = cfg["tests"]
        self.unit_aliases: Dict[str, str] = cfg["unit_aliases"]
        self.alias_to_test: Dict[str, str] = {}
        for canon, spec in self.tests.items():
            for alias in [canon] + spec.get("aliases", []):
                self.alias_to_test[alias.lower()] = canon
        names = "|".join(re.escape(a) for a in sorted(self.alias_to_test, key=len, reverse=True))
        units = "|".join(re.escape(u) for u in sorted(self.unit_aliases, key=len, reverse=True))
        verbs = ("was|were|is|of|at|to|rose|increased|elevated|decreased|fell|dropped|"
                 "peaked|reached|measured|showed|returned|up")
        self._rx = re.compile(
            r"(?<![A-Za-z])(?P<name>%s)(?![A-Za-z])"
            r"(?:\s+(?:level|levels|count|value|values|concentration|activity|result))?"
            r"[\s:=]*(?:(?:%s)\s+)*"
            r"(?:from\s+[\d.,]+\s*(?:%s)?\s+to\s+)?"
            r"(?P<op>[<>≤≥]=?)?\s*(?P<val>\d+(?:[.,]\d+)?)"
            r"(?:\s*(?P<unit>%s)(?![A-Za-z]))?" % (names, verbs, units, units),
            re.I,
        )

    # ------------------------------------------------------------ rule pass
    def deterministic(self, text: str, context: Dict[str, Any]) -> Draft:
        items: List[Dict[str, Any]] = []
        evidence: List[Evidence] = []
        reasons: List[str] = []
        seen = set()
        for m in self._rx.finditer(text):
            unit_raw = m.group("unit")
            canon = self.alias_to_test[m.group("name").lower()]
            spec = self.tests[canon]
            if unit_raw is None and not spec.get("unitless") and _TIME_WORDS.match(text[m.end():m.end() + 14]):
                continue
            value, value_note = self._parse_value(m.group("val"))
            key = (canon, value, m.start())
            if key in seen:
                continue
            seen.add(key)
            unit = self.unit_aliases.get(unit_raw.lower()) if unit_raw else None
            conf, notes = 0.9, [value_note] if value_note else []
            if unit is None and not spec.get("unitless"):
                conf = 0.6
                notes.append("unit missing")
            elif unit and spec.get("units") and unit not in spec["units"]:
                conf = 0.6
                notes.append("unexpected unit for test")
            lo, hi = spec.get("plausible", [None, None])
            if unit and spec.get("units") and unit == spec["units"][0] and lo is not None:
                if value is not None and not (lo <= value <= hi):
                    conf = min(conf, 0.5)
                    notes.append("value outside plausibility bounds")
            ref_lo, ref_hi, uln = self._reference(text, m.end())
            flag = self._flag(value, ref_lo, ref_hi, uln)
            sent_s, sent_e = sentence_bounds(text, m.start(), m.end())
            date = _DATE.search(text, sent_s, sent_e)
            if notes:
                reasons.append(f"{canon}: " + "; ".join(n for n in notes if n))
            items.append({
                "test": canon, "raw_name": m.group("name"), "value": value,
                "operator": m.group("op") or "=", "unit": unit, "raw_unit": unit_raw,
                "reference_low": ref_lo, "reference_high": ref_hi, "uln": uln,
                "flag": flag, "date_raw": date.group(0) if date else None,
                "source": "rule", "confidence": conf,
            })
            evidence.append(evidence_from_span(text, m.start(), m.end(), canon))
        status = "EXTRACTED" if items else "NONE_FOUND"
        conf = min((i["confidence"] for i in items), default=0.8)
        return Draft(status, {"results": items, "llm_rejected": 0}, evidence, conf, reasons)

    @staticmethod
    def _parse_value(raw: str) -> Tuple[Optional[float], str]:
        if _THOUSANDS.match(raw):
            return float(raw.replace(",", "")), "ambiguous comma treated as thousands separator"
        try:
            return float(raw.replace(",", ".")), ""
        except ValueError:
            return None, "value not parseable"

    @staticmethod
    def _reference(text: str, end: int):
        window = text[end:end + 120]
        cut = _WINDOW_CUT.search(window)
        if cut:
            window = window[:cut.start()]
        ref = _REF.search(window)
        uln = _ULN.search(window)
        return (
            float(ref.group("lo")) if ref else None,
            float(ref.group("hi")) if ref else None,
            float(uln.group("uln")) if uln else None,
        )

    @staticmethod
    def _flag(value, lo, hi, uln) -> str:
        if value is None:
            return "UNKNOWN"
        if lo is not None and hi is not None:
            return "LOW" if value < lo else "HIGH" if value > hi else "NORMAL"
        if uln is not None:
            return "HIGH" if value > uln else "NORMAL"
        return "UNKNOWN"

    # ------------------------------------------------------------ LLM pass
    def llm_prompt(self, text: str, context: Dict[str, Any]) -> Tuple[str, str]:
        system = (
            "You extract laboratory results from pharmacovigilance source text. "
            'Return ONLY JSON: {"results":[{"test":str,"value":number,"unit":str|null,'
            '"quote":str}]}. "quote" must be copied verbatim from the text. '
            "Never infer, convert or calculate values."
        )
        return system, text

    def reconcile(self, text, context, draft: Draft, payload, notes) -> Draft:
        items = draft.data["results"]
        for raw in payload.get("results") or []:
            if not isinstance(raw, dict):
                continue
            ev = find_evidence(text, raw.get("quote"), str(raw.get("test", "")))
            canon = self.alias_to_test.get(str(raw.get("test", "")).lower())
            try:
                value = float(raw.get("value"))
            except (TypeError, ValueError):
                value = None
            if ev is None or value is None:
                draft.data["llm_rejected"] += 1
                notes.append("Discarded LLM result: quote not found in source or value invalid.")
                continue
            match = next((i for i in items if i["test"] == (canon or raw.get("test"))
                          and i["value"] == value), None)
            if match:
                match["source"] = "both"
                match["confidence"] = min(0.97, match["confidence"] + 0.05)
                continue
            unit = self.unit_aliases.get(str(raw.get("unit") or "").lower())
            items.append({
                "test": canon or str(raw.get("test")), "raw_name": raw.get("test"),
                "value": value, "operator": "=", "unit": unit, "raw_unit": raw.get("unit"),
                "reference_low": None, "reference_high": None, "uln": None,
                "flag": "UNKNOWN", "date_raw": None, "source": "llm", "confidence": 0.6,
            })
            draft.evidence.append(ev)
            draft.review_reasons.append(
                f"LLM-only finding requires reviewer confirmation: {canon or raw.get('test')}")
        draft.status = "EXTRACTED" if items else "NONE_FOUND"
        draft.confidence = min((i["confidence"] for i in items), default=0.8)
        return draft
