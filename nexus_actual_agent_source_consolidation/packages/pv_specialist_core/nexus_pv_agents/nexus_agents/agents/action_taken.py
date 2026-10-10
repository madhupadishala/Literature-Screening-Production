"""AGENT 5 — Action Taken With Drug.

Deterministic narrative analysis: sentence-level pattern rules, drug
attribution, and clinical-distinction guards. Raw action, normalised action
and E2B G.k.8 coding are kept as separate fields.

E2B(R3) G.k.8 codes: 1=Drug withdrawn, 2=Dose reduced, 3=Dose increased,
4=Dose not changed, 0=Unknown, 9=Not applicable.
"""
from __future__ import annotations

import re
from enum import Enum

from ..schemas import AgentResult, Fact, ICSR, Inference, ResultStatus
from .base import BaseAgent


class ActionNorm(str, Enum):
    DRUG_WITHDRAWN = "drug_withdrawn"
    DOSE_REDUCED = "dose_reduced"
    DOSE_INCREASED = "dose_increased"
    DOSE_NOT_CHANGED = "dose_not_changed"
    UNKNOWN = "unknown"
    NOT_APPLICABLE = "not_applicable"
    TEMPORARY_INTERRUPTION = "temporary_interruption"  # preserved raw; no dedicated E2B code


E2B_GK8 = {
    ActionNorm.DRUG_WITHDRAWN: "1",
    ActionNorm.DOSE_REDUCED: "2",
    ActionNorm.DOSE_INCREASED: "3",
    ActionNorm.DOSE_NOT_CHANGED: "4",
    ActionNorm.UNKNOWN: "0",
    ActionNorm.NOT_APPLICABLE: "9",
    ActionNorm.TEMPORARY_INTERRUPTION: "1",  # coded as withdrawn; raw preserved separately
}

_SENT_SPLIT = re.compile(r"(?<=[.!?;])\s+")

_STOP = re.compile(r"\b(discontinu\w+|stopped|withdrawn|withdrew|ceased|halted|terminated)\b", re.I)
_INTERRUPT = re.compile(r"\b(interrupt\w+|held|withheld|paused|temporarily stop\w+|temporary interruption)\b", re.I)
_REDUCE = re.compile(r"\b(dose\b[^.;]{0,40}?\breduc\w+|reduc\w+ (the )?dose|taper\w*|dose reduction|halved|decreased the dose)\b", re.I)
_INCREASE = re.compile(r"\b(dose (was )?increas\w+|increased (the )?dose|up-?titrat\w+|dose escalation)\b", re.I)
_UNCHANGED = re.compile(r"\b(continued (at|with|on) (the )?(same|unchanged)|dose (was )?not changed|unchanged|maintained (at|on) (the )?same dose|no change (was made )?(to|in) (the )?(dose|therapy))\b", re.I)
_RESTART = re.compile(r"\b(restart\w+|resum\w+|reintroduc\w+|re-?initiat\w+|re-?challeng\w+)\b", re.I)

# clinical-distinction guards
_COMPLETED = re.compile(r"\b(complet\w+ (the )?(course|treatment|therapy)|course (was )?completed|finished (the )?(course|treatment)|end of (the )?(planned )?treatment)\b", re.I)
_LOE = re.compile(r"\b(lack of effic\w+|no (therapeutic )?(effect|response)|ineffective|treatment failure)\b", re.I)
_PRIOR_STOP = re.compile(r"\b(had (been )?(stopped|discontinued|completed).{0,40}(prior to|before) (the )?(event|reaction|onset)|stopped \w+ (days|weeks|months) before|previously discontinued)\b", re.I)
_PROCEDURE = re.compile(r"\b(withheld|held) (for|prior to|before) (the )?(surgery|procedure|operation)\b", re.I)
_DIED = re.compile(r"\b(patient died|fatal|death)\b", re.I)


class ActionTakenAgent(BaseAgent):
    NAME = "action_taken"
    VERSION = "1.0.0"
    REQUIRED_RULES = ["REQ-ICH-E2B-R3-ACTION-TAKEN", "REQ-US-FDA-AEMS-2026"]

    def extract(self, case: ICSR) -> AgentResult:
        return self.safe_run(self._extract, case)

    # ------------------------------------------------------------------
    def _extract(self, case: ICSR) -> AgentResult:
        suspects = [d for d in case.drugs if d.role == "suspect"] or list(case.drugs)
        sentences = _SENT_SPLIT.split(case.narrative) if case.narrative else []
        results = []
        r = self.result(status=ResultStatus.CONFIRMED)

        for drug in suspects:
            rec = self._per_drug(drug.name, drug, sentences, case)
            results.append(rec)
            if rec["normalized_action"] in (ActionNorm.UNKNOWN,):
                r.status = ResultStatus.UNRESOLVED
                r.uncertainties.append(
                    f"action taken with '{drug.name}' not determinable from source text")
            if rec["evidence_quote"] is None and rec["normalized_action"] != ActionNorm.UNKNOWN:
                r.status = ResultStatus.UNRESOLVED

        r.payload = {"case_id": case.case_id, "actions": results,
                     "fields_kept_separate": ["raw_action", "normalized_action", "e2b_gk8"]}
        return r

    def _per_drug(self, name: str, drug, sentences, case) -> dict:
        low = name.lower()
        # sentences that mention the drug (or generic pronoun context when single suspect)
        hits = [s for s in sentences if low in s.lower()]
        if not hits and len([s for s in sentences]) and len(case.drugs) <= 1:
            hits = sentences  # single-drug narrative: drug reference implicit

        for s in hits:
            sl = s.lower()
            norm = None
            guard = None

            if _COMPLETED.search(sl):
                norm, guard = ActionNorm.NOT_APPLICABLE, "treatment completed (not AE-related)"
            elif _PRIOR_STOP.search(sl):
                norm, guard = ActionNorm.NOT_APPLICABLE, "stopped before event onset (not AE-related)"
            elif _PROCEDURE.search(sl):
                norm, guard = ActionNorm.TEMPORARY_INTERRUPTION, "withheld for unrelated procedure"
            elif _INTERRUPT.search(sl):
                norm = ActionNorm.TEMPORARY_INTERRUPTION
                if _RESTART.search(sl):
                    guard = "interrupted then restarted"
            elif _STOP.search(sl):
                norm = ActionNorm.DRUG_WITHDRAWN
                if _LOE.search(sl):
                    guard = "stopped for lack of efficacy (not AE-related)"
                if _RESTART.search(sl):
                    guard = "withdrawn then restarted"
            elif _REDUCE.search(sl):
                norm = ActionNorm.DOSE_REDUCED
            elif _INCREASE.search(sl):
                norm = ActionNorm.DOSE_INCREASED
            elif _UNCHANGED.search(sl):
                norm = ActionNorm.DOSE_NOT_CHANGED

            if norm is not None:
                # NA only when the IG preconditions genuinely apply
                if norm == ActionNorm.NOT_APPLICABLE and not (
                        _COMPLETED.search(sl) or _PRIOR_STOP.search(sl) or
                        _DIED.search(sl) or drug.role == "not_administered"):
                    norm = ActionNorm.UNKNOWN
                return {
                    "drug": name, "raw_action": s.strip(),
                    "normalized_action": norm.value,
                    "e2b_gk8": E2B_GK8[norm],
                    "clinical_distinction": guard,
                    "attribution": "named" if low in sl else "implicit_single_suspect",
                    "evidence_quote": s.strip(),
                    "sequence_note": ("restart documented after action" if guard and "restart" in guard else None),
                }
        return {
            "drug": name, "raw_action": None,
            "normalized_action": ActionNorm.UNKNOWN.value,
            "e2b_gk8": E2B_GK8[ActionNorm.UNKNOWN],
            "clinical_distinction": None, "attribution": None,
            "evidence_quote": None, "sequence_note": None,
        }
