"""AGENT 6 — Dechallenge Assessment.

Per drug-event pair: combines the action taken (G.k.8) with the documented
clinical course / outcome (E.i.7) — exactly how the ICH IG defines dechallenge.
Withdrawal alone is NOT positive dechallenge; improvement alone does NOT
establish causality.
"""
from __future__ import annotations

import re
from enum import Enum

from ..schemas import ICSR, Inference, ResultStatus
from .action_taken import ActionTakenAgent
from .base import BaseAgent


class Dechallenge(str, Enum):
    POSITIVE = "positive"          # withdrawn/reduced AND event improved/resolved
    NEGATIVE = "negative"          # withdrawn/reduced AND no improvement / worsened / fatal
    UNRESOLVED = "unresolved"      # action known, course unknown
    CONFOUNDED = "confounded"      # simultaneous interventions prevent attribution
    NOT_ASSESSABLE = "not_assessable"  # no withdrawal/reduction documented


_IMPROVE = re.compile(r"\b(improv\w+|resolv\w+|recover\w+|subsided|abated|normalized|normalised|cleared|settled)\b", re.I)
_NO_IMPROVE = re.compile(r"\b(did not improve|no improvement|persist\w+|ongoing|not resolved|continued to (worsen|decline))\b", re.I)
_WORSEN = re.compile(r"\b(worsen\w+|deteriorat\w+|progressed|aggravat\w+)\b", re.I)
_TIME_TO_IMPROVE = re.compile(r"(?:within|after)\s+(\d+)\s+(day|days|week|weeks|hour|hours)\s+(?:of|following|after)?\s*(?:discontinu\w+|withdrawal|stopping|cessation|dose reduction)", re.I)
_CONFOUNDERS = re.compile(r"\b(supportive care|treated with (iv )?fluids|corticosteroid\w*|steroid\w* (were )?(started|given|administered)|antihistamine\w*|epinephrine|adrenaline|dialysis|transfusion)\b", re.I)


class DechallengeAgent(BaseAgent):
    NAME = "dechallenge_assessment"
    VERSION = "1.0.0"
    REQUIRED_RULES = ["REQ-ICH-E2B-R3-DECHALLENGE"]

    def assess(self, case: ICSR, action_result=None) -> object:
        return self.safe_run(self._assess, case, action_result)

    def _assess(self, case: ICSR, action_result):
        if action_result is None:
            action_result = ActionTakenAgent(self.register).extract(case)
        actions = {a["drug"]: a for a in action_result.payload["actions"]}
        narrative = case.narrative or ""

        r = self.result(status=ResultStatus.CONFIRMED)
        pairs = []
        for ev in case.events:
            for drug in case.drugs:
                if drug.role not in ("suspect", "interacting"):
                    continue
                act = actions.get(drug.name, {})
                pairs.append(self._assess_pair(case, drug, ev, act, narrative))

        if any(p["dechallenge"] == Dechallenge.CONFOUNDED.value for p in pairs):
            r.status = ResultStatus.HUMAN_REVIEW_REQUIRED
            r.uncertainties.append("simultaneous interventions prevent single-drug attribution")
        if any(p["dechallenge"] == Dechallenge.UNRESOLVED.value for p in pairs):
            r.status = ResultStatus.UNRESOLVED
        r.payload = {"case_id": case.case_id, "drug_event_pairs": pairs,
                     "e2b_note": "Dechallenge is derived from G.k.8 + E.i.7; no separate E2B element exists (REQ-ICH-E2B-R3-DECHALLENGE)."}
        return r

    def _assess_pair(self, case, drug, ev, act, narrative) -> dict:
        e2b_action = act.get("e2b_gk8")
        withdrawn_or_reduced = e2b_action in ("1", "2")
        evidence = act.get("evidence_quote")

        if not withdrawn_or_reduced:
            return self._pair(drug, ev, Dechallenge.NOT_ASSESSABLE, evidence,
                              "no withdrawal or dose reduction documented", e2b_action)

        outcome = ev.outcome_e2b  # 1/2 improved; 3 not resolved; 5 fatal; 4 resolved w/ sequelae
        improved_txt = bool(_IMPROVE.search(narrative))
        not_improved_txt = bool(_NO_IMPROVE.search(narrative))
        worsened_txt = bool(_WORSEN.search(narrative))
        confounded = bool(_CONFOUNDERS.search(narrative))

        if confounded:
            return self._pair(drug, ev, Dechallenge.CONFOUNDED, evidence,
                              "concurrent interventions documented; improvement cannot be "
                              "attributed to withdrawal of this drug alone", e2b_action)

        improved = outcome in ("1", "2", "4") or (outcome is None and improved_txt and not not_improved_txt)
        not_improved = outcome in ("3", "5") or not_improved_txt or worsened_txt

        if improved and not not_improved:
            m = _TIME_TO_IMPROVE.search(narrative)
            tti = f"{m.group(1)} {m.group(2)}" if m else None
            return self._pair(drug, ev, Dechallenge.POSITIVE, evidence,
                              "drug withdrawn/reduced and event improved/resolved"
                              + (f"; time to improvement {tti}" if tti else "")
                              + ". Note: improvement alone does not establish causality.",
                              e2b_action, time_to_improvement=tti)
        if not_improved:
            return self._pair(drug, ev, Dechallenge.NEGATIVE, evidence,
                              "drug withdrawn/reduced but event did not improve (or worsened/fatal)",
                              e2b_action)
        return self._pair(drug, ev, Dechallenge.UNRESOLVED, evidence,
                          "withdrawal documented but clinical course not described", e2b_action)

    @staticmethod
    def _pair(drug, ev, cls: Dechallenge, evidence, rationale, e2b_action,
              time_to_improvement=None) -> dict:
        return {
            "drug": drug.name, "event": ev.verbatim,
            "dechallenge": cls.value,
            "action_e2b_gk8": e2b_action,
            "event_outcome_e2b_ei7": ev.outcome_e2b,
            "evidence_quote": evidence,
            "time_to_improvement": time_to_improvement,
            "rationale": rationale,
            "causality_disclaimer": "dechallenge outcome alone does not establish drug causality",
        }
