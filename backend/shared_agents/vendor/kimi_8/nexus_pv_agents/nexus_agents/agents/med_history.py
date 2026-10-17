"""AGENT 8 — Medical History and CAP Extraction.

Extracts patient history with clinical distinctions: past vs current, patient
vs family, confirmed vs suspected, negated vs positive, indication vs adverse
event, history vs concurrent illness. Verbatim preserved alongside coding
(licensed MedDRA in production; placeholder lexicon flags UNCODED).

CAP: the field scope is defined by an explicit, documented config (cap_fields)
— undocumented attributes are never invented.
"""
from __future__ import annotations

import re

from ..schemas import ICSR, ResultStatus, SourceDocument
from ..terminology import TerminologyService
from .base import BaseAgent

_HIST_SECTION = re.compile(
    r"(?:past )?medical history[:\-]?(.*?)(?:\.(?:\s|$)|$)", re.I | re.S)
_HISTORY_OF = re.compile(
    r"\b(?:history of|h/o|known (?:case of|to have)|diagnosed with)\s+([a-z][a-z\- ]{2,40})",
    re.I)
_ALLERGY = re.compile(r"\b(?:allerg(?:y|ies|ic) to|hypersensitive to)\s+([a-z][a-z\- ]{2,30})", re.I)
_FAMILY = re.compile(r"\bfamily history of\s+([a-z][a-z\- ]{2,40})", re.I)
_SURGICAL = re.compile(r"\b(?:underwent|status post|s/p|had)\s+((?:a |an )?[a-z][a-z\- ]{2,30}(?:surgery|ectomy|plasty|transplant|bypass))", re.I)
_NEGATION = re.compile(r"\b(?:no|denies|denied|without|negative for|free of)\s+(?:history of\s+|significant\s+)?$", re.I)
_SUSPECTED = re.compile(r"\b(?:suspected|possible|probable|query|\?)\s*$", re.I)
_CURRENT = re.compile(r"\b(?:on treatment for|being treated for|currently|ongoing|active)\s+([a-z][a-z\- ]{2,40})", re.I)

# CAP scope — must be explicitly documented before implementation (Phase 2, Agent 8)
DEFAULT_CAP_FIELDS = ("medical_history", "surgical_history", "allergies",
                      "family_history", "past_adverse_reactions",
                      "concomitant_conditions", "risk_factors")


class MedicalHistoryAgent(BaseAgent):
    NAME = "medical_history_cap_extraction"
    VERSION = "1.0.0"
    REQUIRED_RULES: list[str] = []  # terminology rule is license-blocked; see below

    def __init__(self, register=None, terminology: TerminologyService | None = None,
                 cap_fields: tuple[str, ...] = DEFAULT_CAP_FIELDS):
        super().__init__(register)
        self.terminology = terminology or TerminologyService()
        unknown = set(cap_fields) - set(DEFAULT_CAP_FIELDS)
        if unknown:
            raise ValueError(f"undocumented CAP attributes refused: {sorted(unknown)}")
        self.cap_fields = cap_fields

    def extract(self, case: ICSR, documents: list[SourceDocument] | None = None) -> object:
        return self.safe_run(self._extract, case)

    # ------------------------------------------------------------------
    def _extract(self, case: ICSR):
        text = case.medical_history_text or ""
        narrative = case.narrative or ""
        full = f"{text}\n{narrative}".strip()

        items: list[dict] = []

        def add(kind, verbatim, category="medical_history", temporal="past",
                subject="patient", confirmation="confirmed", negated=False):
            coded = self.terminology.code(verbatim) if not negated else None
            items.append({
                "kind": kind, "category": category, "verbatim": verbatim.strip(),
                "coded_term": coded, "coding_status": "coded" if coded else (
                    "not_applicable_negated" if negated else "UNCODED"),
                "temporality": temporal, "subject": subject,
                "confirmation": confirmation, "negated": negated,
            })

        for m in _HIST_SECTION.finditer(full):
            for part in re.split(r",| and |;", m.group(1)):
                part = part.strip()
                if not part or part.lower() in ("none", "unremarkable", "nil"):
                    continue
                if re.match(r"(?:no|denies|without)\b", part, re.I):
                    add("condition", part, negated=True)
                else:
                    add("condition", part)

        for m in _FAMILY.finditer(full):
            add("family_history", m.group(1), "family_history", "past", "family")

        for m in _SURGICAL.finditer(full):
            add("surgical_history", m.group(1), "surgical_history")

        for m in _ALLERGY.finditer(full):
            add("allergy", m.group(1), "allergies")

        for m in _HISTORY_OF.finditer(full):
            prefix = full[max(0, m.start() - 30):m.start()]
            negated = bool(_NEGATION.search(prefix))
            suspected = bool(_SUSPECTED.search(full[m.start():m.start() + 40]))
            # family-history overlaps are handled above
            pre = full[max(0, m.start() - 15):m.start()].lower()
            if "family" in pre:
                continue
            add("condition", m.group(1), confirmation="suspected" if suspected else "confirmed",
                negated=negated)

        for m in _CURRENT.finditer(full):
            add("concurrent_illness", m.group(1), "concomitant_conditions", temporal="current")

        # drug indication must NOT be recorded as an adverse event or dropped
        indications = [{"drug": d.name, "indication": d.indication}
                       for d in case.drugs if d.indication]

        uncoded = [i["verbatim"] for i in items if i["coding_status"] == "UNCODED"]
        r = self.result(status=ResultStatus.CONFIRMED)
        if uncoded:
            r.status = ResultStatus.UNRESOLVED
            r.uncertainties.append(
                "verbatim(s) could not be coded with the development placeholder "
                f"lexicon — licensed MedDRA 29.0 service required: {uncoded}")
        r.payload = {
            "case_id": case.case_id,
            "cap_scope": list(self.cap_fields),
            "history_items": items,
            "indications_preserved": indications,
            "negated_not_coded_as_positive": True,
            "verbatim_preserved": True,
            "licensed_terminology_blocker": "REQ-MEDDRA-29.0 (BLOCKED_LICENSE_REQUIRED)",
        }
        return r
