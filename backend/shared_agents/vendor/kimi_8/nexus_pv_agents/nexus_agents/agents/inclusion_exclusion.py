"""AGENT 4 — Literature Inclusion / Exclusion Flagging.

Flags: INCLUDE / EXCLUDE / FULL_TEXT_REQUIRED / MEDICAL_REVIEW_REQUIRED /
DUPLICATE_REVIEW_REQUIRED / UNRESOLVED — each with controlled reason codes.
No unsupported automatic clinical exclusion is permitted: every flag carries
its exact reasons and evidence limitation.
"""
from __future__ import annotations

from enum import Enum

from ..schemas import LiteratureArticle, ResultStatus
from .base import BaseAgent


class Flag(str, Enum):
    INCLUDE = "INCLUDE"
    EXCLUDE = "EXCLUDE"
    FULL_TEXT_REQUIRED = "FULL_TEXT_REQUIRED"
    MEDICAL_REVIEW_REQUIRED = "MEDICAL_REVIEW_REQUIRED"
    DUPLICATE_REVIEW_REQUIRED = "DUPLICATE_REVIEW_REQUIRED"
    UNRESOLVED = "UNRESOLVED"


class ReasonCode(str, Enum):
    ICSR_POTENTIAL = "ICSR_POTENTIAL"
    AGGREGATE_SAFETY_INFO = "AGGREGATE_SAFETY_INFO"
    PRODUCT_IN_SCOPE = "PRODUCT_IN_SCOPE"
    PRODUCT_OUT_OF_SCOPE = "PRODUCT_OUT_OF_SCOPE"
    NO_SAFETY_CONTENT = "NO_SAFETY_CONTENT"
    NO_IDENTIFIABLE_CASE = "NO_IDENTIFIABLE_CASE"
    ABSTRACT_ONLY_LIMITATION = "ABSTRACT_ONLY_LIMITATION"
    FULL_TEXT_NEEDED_TO_CONFIRM = "FULL_TEXT_NEEDED_TO_CONFIRM"
    DUPLICATE_SUSPECTED = "DUPLICATE_SUSPECTED"
    SIGNAL_RELEVANCE = "SIGNAL_RELEVANCE"
    SPECIAL_SITUATION = "SPECIAL_SITUATION"
    INSUFFICIENT_METADATA = "INSUFFICIENT_METADATA"
    NON_COMPANY_PRODUCT_WITH_SAFETY_INFO = "NON_COMPANY_PRODUCT_WITH_SAFETY_INFO"


_SAFETY_TERMS = (
    "adverse", "side effect", "toxicity", "overdose", "hypersensitivity",
    "anaphylaxis", "reaction", "death", "fatal", "hospital", "injury",
    "hepatotoxicity", "nephrotoxicity", "cardiotoxicity", "withdrawn due",
    "intolerance", "medication error", "abuse", "misuse", "off-label",
    "pregnancy", "lack of efficacy", "interaction",
)
_SPECIAL_SITUATIONS = ("pregnancy", "breastfeeding", "overdose", "abuse",
                       "misuse", "medication error", "occupational exposure",
                       "off-label")
_CASE_MARKERS = ("case report", "we report", "year-old", "yo ", "patient presented",
                 "a patient", "case of")


class InclusionExclusionAgent(BaseAgent):
    NAME = "literature_inclusion_exclusion"
    VERSION = "1.0.0"
    REQUIRED_RULES = ["REQ-ICH-E2D-R1-FOLLOWUP", "REQ-US-21CFR-314.80",
                      "REQ-EU-GVPIX-SIGNAL"]

    def screen(self, article: LiteratureArticle,
               product_scope: list[str],
               duplicate_suspected: bool = False,
               has_valid_case_minimum: bool | None = None) -> object:
        return self.safe_run(self._screen, article, product_scope,
                             duplicate_suspected, has_valid_case_minimum)

    def _screen(self, art, product_scope, duplicate_suspected, has_valid_case_minimum):
        reasons: list[str] = []
        dims: dict[str, str] = {}
        text = f"{art.title} {art.abstract}".lower()

        in_scope = [p for p in product_scope if p.lower() in text or
                    any(p.lower() in m.lower() for m in art.mentions_products)]
        safety_hit = any(t in text for t in _SAFETY_TERMS) or bool(art.mentioned_events)
        special = [s for s in _SPECIAL_SITUATIONS if s in text]
        case_like = (art.patient_count or 0) > 0 or any(m in text for m in _CASE_MARKERS) \
            or bool(art.described_patients)
        is_review_type = any("review" in pt.lower() or "meta-analysis" in pt.lower()
                             for pt in art.publication_types)

        # dimensional assessment (each evaluated separately)
        dims["patient_safety_relevance"] = "yes" if safety_hit else "no"
        dims["product_relevance"] = "in_scope" if in_scope else "out_of_scope"
        dims["potential_icsr_information"] = "yes" if case_like and safety_hit else "no"
        dims["aggregate_safety_information"] = "yes" if (is_review_type and safety_hit) else "no"
        dims["source_completeness"] = "full_text" if art.has_full_text else ("abstract" if art.abstract else "title_only")
        dims["special_situations"] = ",".join(special) if special else "none"
        dims["duplicate_status"] = "suspected" if duplicate_suspected else "clear"
        dims["signal_relevance"] = "yes" if (safety_hit and (is_review_type or (art.patient_count or 0) > 1)) else "no"

        # ---- decision logic (never equate categories across the prohibitions)
        if duplicate_suspected:
            reasons.append(ReasonCode.DUPLICATE_SUSPECTED.value)
            return self._finish(Flag.DUPLICATE_REVIEW_REQUIRED, reasons, dims, art)

        if not art.abstract and not art.has_full_text:
            if safety_hit or in_scope or not art.title:
                reasons += [ReasonCode.FULL_TEXT_NEEDED_TO_CONFIRM.value,
                            ReasonCode.INSUFFICIENT_METADATA.value]
                return self._finish(Flag.FULL_TEXT_REQUIRED, reasons, dims, art)
            reasons += [ReasonCode.NO_SAFETY_CONTENT.value,
                        ReasonCode.INSUFFICIENT_METADATA.value]
            return self._finish(Flag.EXCLUDE, reasons, dims, art,
                                note="title-only record with no safety signal in title")

        if not safety_hit and not special:
            # no safety content at all
            if is_review_type:
                return self._finish(Flag.EXCLUDE,
                                    [ReasonCode.NO_SAFETY_CONTENT.value], dims, art)
            reasons.append(ReasonCode.NO_SAFETY_CONTENT.value)
            return self._finish(Flag.EXCLUDE, reasons, dims, art)

        # safety content exists from here on
        if special:
            reasons.append(ReasonCode.SPECIAL_SITUATION.value)
        if dims["signal_relevance"] == "yes":
            reasons.append(ReasonCode.SIGNAL_RELEVANCE.value)

        if not in_scope:
            # non-company product is NOT automatically irrelevant
            reasons.append(ReasonCode.NON_COMPANY_PRODUCT_WITH_SAFETY_INFO.value)
            if case_like:
                return self._finish(Flag.MEDICAL_REVIEW_REQUIRED, reasons, dims, art,
                                    note="safety information on out-of-scope product; "
                                         "client/MAH applicability requires medical judgement")
            return self._finish(Flag.EXCLUDE,
                                reasons + [ReasonCode.PRODUCT_OUT_OF_SCOPE.value,
                                           ReasonCode.NO_IDENTIFIABLE_CASE.value], dims, art)

        reasons.append(ReasonCode.PRODUCT_IN_SCOPE.value)
        if case_like and has_valid_case_minimum is True:
            reasons.append(ReasonCode.ICSR_POTENTIAL.value)
            return self._finish(Flag.INCLUDE, reasons, dims, art)
        if case_like and has_valid_case_minimum is False:
            # invalid ICSR does NOT make the publication irrelevant
            reasons.append(ReasonCode.ICSR_POTENTIAL.value)
            return self._finish(Flag.MEDICAL_REVIEW_REQUIRED, reasons, dims, art,
                                note="case described but minimum ICSR criteria not met; "
                                     "still potentially signal-relevant")
        if case_like:
            reasons.append(ReasonCode.ICSR_POTENTIAL.value)
            if not art.has_full_text:
                reasons.append(ReasonCode.ABSTRACT_ONLY_LIMITATION.value)
                return self._finish(Flag.FULL_TEXT_REQUIRED, reasons, dims, art,
                                    note="potential ICSR; full text needed to confirm "
                                         "validity and extract case detail")
            return self._finish(Flag.INCLUDE, reasons, dims, art)
        if is_review_type and safety_hit:
            reasons.append(ReasonCode.AGGREGATE_SAFETY_INFO.value)
            return self._finish(Flag.INCLUDE, reasons, dims, art,
                                note="aggregate safety information for signal assessment; "
                                     "not an individual case")

        return self._finish(Flag.UNRESOLVED,
                            reasons + [ReasonCode.INSUFFICIENT_METADATA.value], dims, art)

    def _finish(self, flag: Flag, reasons: list[str], dims: dict, art, note: str | None = None):
        r = self.result(status=(ResultStatus.CONFIRMED if flag in (Flag.INCLUDE, Flag.EXCLUDE)
                                else ResultStatus.HUMAN_REVIEW_REQUIRED))
        r.payload = {
            "record_id": art.record_id, "flag": flag.value,
            "reason_codes": reasons, "assessment_dimensions": dims,
            "evidence_level": ("full_text" if art.has_full_text else
                               "abstract" if art.abstract else "title_only"),
            "note": note,
            "reviewer_can_trace_reasons": True,
        }
        return r
