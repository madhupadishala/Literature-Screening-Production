"""AGENT 2 — ICSR Duplicate Detection.

Deterministic identifiers first, then candidate retrieval, structured
field-weighted comparison and evidence-grounded classification. Originals are
preserved; merges are reversible and auditable (GVP VI Addendum I master-case
model). Different case numbers do NOT establish different patients.
"""
from __future__ import annotations

from datetime import date
from enum import Enum

from ..schemas import AgentResult, ICSR, Inference, ResultStatus, Sex
from ..textnorm import token_jaccard
from .base import BaseAgent


class DupClass(str, Enum):
    EXACT_DUPLICATE = "exact_duplicate"
    PROBABLE_DUPLICATE = "probable_duplicate"
    POSSIBLE_DUPLICATE = "possible_duplicate"
    FOLLOW_UP = "follow_up_to_existing_icsr"
    RELATED_BUT_DISTINCT = "related_but_distinct_case"
    NEW_CASE = "new_case"
    UNRESOLVED = "unresolved"


# field weights (sum = 1.0); hard contradictions handled separately
_WEIGHTS = {
    "sex": 0.10, "age": 0.12, "onset": 0.16, "drugs": 0.18,
    "events": 0.18, "country": 0.06, "reporter": 0.06, "narrative": 0.14,
}


class IcsrDuplicateAgent(BaseAgent):
    NAME = "icsr_duplicate_detection"
    VERSION = "1.0.0"
    REQUIRED_RULES = ["REQ-EU-GVPVI-ADD1-DUP", "REQ-EU-GVPVI-VALID-ICSR",
                      "REQ-ICH-E2D-R1-FOLLOWUP"]

    # ------------------------------------------------------------------ API
    def compare(self, incoming: ICSR, existing: ICSR) -> AgentResult:
        return self.safe_run(self._compare, incoming, existing)

    def merge(self, master: ICSR, subordinate: ICSR) -> dict:
        """Reversible, auditable master-case merge per GVP VI Addendum I."""
        return self.safe_run(self._merge, master, subordinate)

    # ------------------------------------------------------------- compare
    def _compare(self, a: ICSR, b: ICSR) -> AgentResult:
        # ---- tier 0: declared follow-up linkage
        if a.followup_to_case_id and a.followup_to_case_id == b.case_id:
            return self._finish(DupClass.FOLLOW_UP, 1.0,
                                ["declared follow-up linkage"], [], [], a, b)

        # ---- tier 1: deterministic identifiers
        wa, wb = a.worldwide_unique_id, b.worldwide_unique_id
        if wa and wb and wa == wb:
            cls = DupClass.FOLLOW_UP if (a.version != b.version) else DupClass.EXACT_DUPLICATE
            return self._finish(cls, 1.0, [f"worldwide unique case ID match {wa}"],
                                [], [f"C.1.8.1 == {wa}"], a, b)
        if a.sender_case_id and a.sender_organization and \
                a.sender_case_id == b.sender_case_id and \
                a.sender_organization == b.sender_organization:
            return self._finish(DupClass.EXACT_DUPLICATE, 1.0,
                                ["same sender + same sender case ID"], [],
                                [f"{a.sender_organization}:{a.sender_case_id}"], a, b)
        shared_other = set(a.other_case_identifiers) & (
            {b.sender_case_id, b.worldwide_unique_id} | set(b.other_case_identifiers)) - {None}
        if shared_other:
            return self._finish(DupClass.EXACT_DUPLICATE, 0.98,
                                [f"shared other case identifier {sorted(shared_other)}"],
                                [], [], a, b)

        # ---- tier 2: structured field-weighted comparison
        matched, mismatched, evidence = [], [], []
        score, earned, possible = 0.0, 0.0, 0.0

        def accrue(name, w, sim, note_match, note_miss):
            nonlocal earned, possible
            possible += w
            earned += w * sim
            (matched if sim >= 0.6 else mismatched).append(
                (note_match if sim >= 0.6 else note_miss) + f" ({sim:.2f})")

        # sex: hard contradiction for same-patient matching; classification
        # then depends on the remaining evidence (handled after scoring)
        sex_contradiction = False
        if a.patient.sex != Sex.UNKNOWN and b.patient.sex != Sex.UNKNOWN:
            if a.patient.sex != b.patient.sex:
                sex_contradiction = True
                mismatched.append("patient sex differs")
                evidence.append("sex contradiction excludes same-patient match")
                possible += _WEIGHTS["sex"]  # no credit
            else:
                accrue("sex", _WEIGHTS["sex"], 1.0, "patient sex matches", "")
        # unknown sex on either side: no evidence, no credit

        # age
        if a.patient.age_value is not None and b.patient.age_value is not None:
            diff = abs(a.patient.age_value - b.patient.age_value)
            sim = 1.0 if diff <= 1 else max(0.0, 1.0 - diff / 10.0)
            accrue("age", _WEIGHTS["age"], sim,
                   f"age match (Δ{diff:.0f}y)", f"age differs by {diff:.0f}y")

        # onset dates
        ona = [e.onset_date for e in a.events if e.onset_date]
        onb = [e.onset_date for e in b.events if e.onset_date]
        if ona and onb:
            best = min(abs((x - y).days) for x in ona for y in onb)
            sim = 1.0 if best == 0 else (0.7 if best <= 3 else (0.3 if best <= 14 else 0.0))
            accrue("onset", _WEIGHTS["onset"], sim,
                   f"event onset Δ{best}d", f"event onset differs by {best}d")

        # drugs / events (verbatim token overlap)
        da = " ".join(d.name for d in a.drugs if d.role == "suspect")
        db = " ".join(d.name for d in b.drugs if d.role == "suspect")
        accrue("drugs", _WEIGHTS["drugs"], token_jaccard(da, db),
               "suspect drug(s) overlap", "suspect drug(s) differ")
        ea = " ".join(e.verbatim for e in a.events)
        eb = " ".join(e.verbatim for e in b.events)
        accrue("events", _WEIGHTS["events"], token_jaccard(ea, eb),
               "event terms overlap", "event terms differ")

        # country
        if a.country_of_occurrence and b.country_of_occurrence:
            accrue("country", _WEIGHTS["country"],
                   1.0 if a.country_of_occurrence == b.country_of_occurrence else 0.0,
                   "country matches", "country differs")

        # reporter organization
        roa = {r.organization for r in a.reporters if r.organization}
        rob = {r.organization for r in b.reporters if r.organization}
        if roa and rob:
            accrue("reporter", _WEIGHTS["reporter"], 1.0 if roa & rob else 0.3,
                   "reporter organisation overlap", "different reporter organisations")

        # narrative similarity
        if a.narrative and b.narrative:
            accrue("narrative", _WEIGHTS["narrative"], token_jaccard(a.narrative, b.narrative),
                   "narrative token overlap", "narratives differ")

        score = earned / possible if possible else 0.0

        # evidence-sparse cases must not be forced into a confident decision
        if possible < 0.3:
            return self._finish(DupClass.UNRESOLVED, score, matched, mismatched,
                                ["insufficient structured evidence to decide"], a, b)

        # a sex contradiction can never be the same patient: if the remaining
        # fields are otherwise highly concordant the pair is a related-but-
        # distinct / possible data-entry case needing review; otherwise it is
        # simply a new, unrelated case.
        if sex_contradiction:
            cls = (DupClass.RELATED_BUT_DISTINCT if score >= 0.55 else DupClass.NEW_CASE)
            return self._finish(cls, score, matched, mismatched, evidence, a, b)

        # EXACT_DUPLICATE is reserved for deterministic identifier evidence;
        # field-similarity alone can at most establish PROBABLE (Addendum I
        # confirmation principle) and always requires manual review.
        if score >= 0.70:
            cls = DupClass.PROBABLE_DUPLICATE
        elif score >= 0.55:
            cls = DupClass.PROBABLE_DUPLICATE
        elif score >= 0.55:
            cls = DupClass.POSSIBLE_DUPLICATE
        elif score >= 0.35:
            cls = DupClass.UNRESOLVED
        else:
            cls = DupClass.NEW_CASE
        return self._finish(cls, score, matched, mismatched, evidence, a, b)

    # --------------------------------------------------------------- merge
    def _merge(self, master: ICSR, subordinate: ICSR) -> AgentResult:
        r = self.result(status=ResultStatus.CONFIRMED)
        link = {
            "merge_id": f"MERGE-{master.case_id}-{subordinate.case_id}",
            "master_case_id": master.case_id,
            "master_worldwide_id": master.worldwide_unique_id,
            "subordinate_case_id": subordinate.case_id,
            "subordinate_worldwide_id": subordinate.worldwide_unique_id,
            "subordinate_flag": "duplicate_of_master",
            "c_1_9_1_record": subordinate.sender_case_id or subordinate.worldwide_unique_id,
            "reversible": True,
            "audit": {
                "action": "allocate_master_case",
                "rule": "REQ-EU-GVPVI-ADD1-DUP",
                "note": ("Subordinate preserved for audit trail and follow-up receipt; "
                         "only master used for signal detection/medical evaluation. "
                         "New information on either case triggers a new duplicate check."),
            },
        }
        r.payload = link
        return r

    # ------------------------------------------------------------- helpers
    def _finish(self, cls: DupClass, score, matched, mismatched, evidence, a, b) -> AgentResult:
        manual = cls in (DupClass.PROBABLE_DUPLICATE, DupClass.POSSIBLE_DUPLICATE,
                         DupClass.UNRESOLVED)
        r = self.result(status=ResultStatus.HUMAN_REVIEW_REQUIRED if manual
                        else ResultStatus.CONFIRMED)
        r.inferences.append(Inference(
            field="icsr_duplicate_class", value=cls.value,
            rationale="matched: " + ("; ".join(matched) or "none") +
                      " | mismatched: " + ("; ".join(mismatched) or "none"),
            confidence=min(score, 1.0), applied_knowledge=self.REQUIRED_RULES))
        r.payload = {
            "case_a": a.case_id, "case_b": b.case_id,
            "classification": cls.value, "matching_score": round(min(score, 1.0), 3),
            "matched_attributes": matched, "mismatches": mismatched,
            "evidence": evidence, "manual_review": manual,
            "merge_permitted": cls == DupClass.EXACT_DUPLICATE,
            "followup_link_permitted": cls in (DupClass.EXACT_DUPLICATE,
                                               DupClass.PROBABLE_DUPLICATE,
                                               DupClass.FOLLOW_UP),
        }
        return r
