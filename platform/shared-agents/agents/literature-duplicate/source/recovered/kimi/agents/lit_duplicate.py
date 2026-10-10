"""AGENT 1 — Literature Duplicate Detection.

Similar publications are NOT automatically duplicate ICSRs. Separate decisions:
bibliographic record / publication content / patient-case overlap / related /
new case / unresolved. Literature with potentially new safety information is
never auto-discarded.
"""
from __future__ import annotations

from enum import Enum

from ..schemas import AgentResult, Inference, LiteratureArticle, ResultStatus
from ..textnorm import (author_overlap, normalize_doi, normalize_pmid,
                        title_similarity, token_jaccard)
from .base import BaseAgent


class LitRelation(str, Enum):
    DUPLICATE_BIBLIOGRAPHIC_RECORD = "duplicate_bibliographic_record"
    DUPLICATE_PUBLICATION_CONTENT = "duplicate_publication_content"
    OVERLAPPING_PATIENT_CASE = "overlapping_patient_case"
    FOLLOWUP_TO_EXISTING_ICSR = "followup_to_existing_icsr"
    RELATED_PUBLICATION = "related_publication"
    NEW_INDEPENDENT_CASE = "new_independent_case"
    UNRESOLVED = "unresolved"


def _is_preprint(a: LiteratureArticle) -> bool:
    src = (a.journal or "").lower() + " " + " ".join(a.publication_types).lower()
    return any(k in src for k in ("preprint", "biorxiv", "medrxiv", "ssrn", "arxiv"))


def _is_conference_abstract(a: LiteratureArticle) -> bool:
    src = " ".join(a.publication_types).lower()
    return "conference" in src or "abstract" in src or "meeting" in src


class LiteratureDuplicateAgent(BaseAgent):
    NAME = "literature_duplicate_detection"
    VERSION = "1.0.0"
    REQUIRED_RULES = ["REQ-ICH-E2D-R1-FOLLOWUP"]

    def assess_pair(
        self,
        incoming: LiteratureArticle,
        existing: LiteratureArticle,
        known_icsr_case_ids: dict[str, list[str]] | None = None,
    ) -> AgentResult:
        return self.safe_run(self._assess_pair, incoming, existing, known_icsr_case_ids)

    def _assess_pair(self, a: LiteratureArticle, b: LiteratureArticle,
                     known_icsr_case_ids=None) -> AgentResult:
        matched, mismatches, evidence = [], [], []

        # ---- tier 1: deterministic identifiers
        pa, pb = normalize_pmid(a.pmid), normalize_pmid(b.pmid)
        da, db = normalize_doi(a.doi), normalize_doi(b.doi)
        if pa and pb:
            if pa == pb:
                matched.append(f"PMID exact match {pa}")
                evidence.append(f"{a.record_id}.pmid == {b.record_id}.pmid == {pa}")
                return self._finish(LitRelation.DUPLICATE_BIBLIOGRAPHIC_RECORD, 1.0,
                                    matched, mismatches, evidence, a, b, manual_review=False)
            mismatches.append(f"PMID differs ({pa} vs {pb})")
        if da and db:
            if da == db:
                matched.append(f"DOI exact match {da}")
                evidence.append(f"{a.record_id}.doi == {b.record_id}.doi == {da}")
                return self._finish(LitRelation.DUPLICATE_BIBLIOGRAPHIC_RECORD, 1.0,
                                    matched, mismatches, evidence, a, b, manual_review=False)
            mismatches.append(f"DOI differs ({da} vs {db})")

        # ---- tier 2: bibliographic similarity
        tsim = title_similarity(a.title, b.title)
        asim = author_overlap(a.authors, b.authors)
        jsim = token_jaccard(a.abstract, b.abstract) if a.abstract and b.abstract else 0.0
        year_close = (a.year and b.year and abs(a.year - b.year) <= 1)
        if tsim >= 0.95:
            matched.append(f"title near-identical ({tsim:.2f})")
        elif tsim >= 0.75:
            matched.append(f"title similar ({tsim:.2f})")
        if asim > 0:
            matched.append(f"author overlap {asim:.2f}")
        if year_close:
            matched.append("publication year within 1")
        if jsim >= 0.6:
            matched.append(f"abstract token overlap {jsim:.2f}")

        # preprint -> final publication; conference abstract -> full article
        if tsim >= 0.85 and asim >= 0.5 and year_close:
            if _is_preprint(a) != _is_preprint(b):
                return self._finish(LitRelation.DUPLICATE_PUBLICATION_CONTENT, 0.95,
                                    matched + ["preprint/final-publication pair"], mismatches,
                                    evidence, a, b, manual_review=True)
            if _is_conference_abstract(a) != _is_conference_abstract(b):
                return self._finish(LitRelation.DUPLICATE_PUBLICATION_CONTENT, 0.9,
                                    matched + ["conference-abstract/full-article pair"], mismatches,
                                    evidence, a, b, manual_review=True)
            return self._finish(LitRelation.DUPLICATE_BIBLIOGRAPHIC_RECORD, 0.95,
                                matched, mismatches, evidence, a, b, manual_review=True)

        # ---- tier 3: patient-case overlap (separate decision axis)
        pa_desc, pb_desc = set(a.described_patients), set(b.described_patients)
        patient_overlap = bool(pa_desc & pb_desc) or (
            a.patient_count is not None and a.patient_count == b.patient_count and
            tsim >= 0.5 and asim >= 0.5
        )
        if patient_overlap and tsim < 0.85:
            # same patient described in different papers -> NOT a duplicate record
            return self._finish(LitRelation.OVERLAPPING_PATIENT_CASE, 0.7,
                                matched + ["shared patient descriptor"], mismatches,
                                evidence, a, b, manual_review=True)

        # ---- tier 4: linkage to an existing ICSR
        if known_icsr_case_ids:
            for key in (pa, da):
                if key and key in known_icsr_case_ids:
                    return self._finish(LitRelation.FOLLOWUP_TO_EXISTING_ICSR, 0.9,
                                        matched + [f"identifier {key} already cited on ICSR"],
                                        mismatches, evidence, a, b, manual_review=True,
                                        extra={"linked_cases": known_icsr_case_ids[key]})

        # conflicting deterministic identifiers are strong negative evidence
        id_mismatch = (pa and pb and pa != pb) or (da and db and da != db)
        if tsim >= 0.5 or asim >= 0.5:
            return self._finish(LitRelation.RELATED_PUBLICATION, max(tsim, asim, 0.5),
                                matched, mismatches, evidence, a, b, manual_review=True)
        if (tsim < 0.2 and asim < 0.2) or (id_mismatch and tsim < 0.75):
            return self._finish(LitRelation.NEW_INDEPENDENT_CASE, 0.1, matched,
                                mismatches, evidence, a, b, manual_review=False)
        return self._finish(LitRelation.UNRESOLVED, 0.4, matched, mismatches,
                            evidence, a, b, manual_review=True)

    def _finish(self, relation: LitRelation, score, matched, mismatches,
                evidence, a, b, manual_review, extra=None) -> AgentResult:
        status = (ResultStatus.CONFIRMED
                  if relation == LitRelation.DUPLICATE_BIBLIOGRAPHIC_RECORD and not manual_review
                  else ResultStatus.HUMAN_REVIEW_REQUIRED if manual_review
                  else ResultStatus.CONFIRMED)
        r = self.result(status=status)
        r.inferences.append(Inference(
            field="literature_relationship", value=relation.value,
            rationale="; ".join(matched) or "no shared identifiers or bibliographic similarity",
            confidence=min(score, 1.0),
            applied_knowledge=self.REQUIRED_RULES))
        r.payload = {
            "candidate_record_ids": [a.record_id, b.record_id],
            "relationship": relation.value,
            "matching_score": round(min(score, 1.0), 3),
            "matched_attributes": matched,
            "mismatches": mismatches,
            "manual_review": manual_review,
            **(extra or {}),
        }
        # Never auto-discard: anything short of a confirmed bibliographic
        # duplicate stays visible to downstream screening.
        r.payload["eligible_for_auto_exclusion"] = (
            relation == LitRelation.DUPLICATE_BIBLIOGRAPHIC_RECORD and not manual_review)
        return r
