"""AGENT 7 — Rechallenge Assessment.

Determines whether an adverse event recurred after re-administration of the
same product. Positive requires BOTH documented re-administration AND a
supported recurrence relationship. Distinguishes true clinical rechallenge
from accidental re-exposure, dose continuation, repeated treatment cycles and
hypothetical discussion. The agent only observes reported information — it
must NEVER suggest performing a rechallenge.
"""
from __future__ import annotations

import re
from enum import Enum

from ..schemas import ICSR, ResultStatus
from .base import BaseAgent


class Rechallenge(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    UNRESOLVED = "unresolved"          # readministered, outcome unknown/conflicting
    NOT_RECHALLENGED = "not_rechallenged"


E2B_GK9I4 = {  # Did Reaction Recur on Re-administration?
    Rechallenge.POSITIVE: "1",       # yes-yes
    Rechallenge.NEGATIVE: "2",       # yes-no
    Rechallenge.UNRESOLVED: "3",     # yes-unk
    Rechallenge.NOT_RECHALLENGED: "4",  # no-n/a
}

_READMIN = re.compile(r"\b(restart\w*|resum\w*|reintroduc\w*|re-?initiat\w*|re-?challeng\w*|re-?administ\w*|re-?expos\w*|given again|started again)\b", re.I)
_RECUR = re.compile(r"\b(recur\w*|reappear\w*|returned|relapsed|came back|developed again|redevelop\w*)\b", re.I)
_NO_RECUR = re.compile(r"\b(did not recur|no recurrence|without recurrence|did not reappear|no reappearance|was well tolerated|tolerated (well|without))\b", re.I)
_HYPOTHETICAL = re.compile(r"\b(was not (restarted|re-?challenged|resumed|readministered)|no re-?challenge (was )?(performed|attempted|done)|if (the drug|it) (is|were|was) restarted|re-?challenge was not|not re-?challenged)\b", re.I)
_ACCIDENTAL = re.compile(r"\b(?:accidental(?:ly)?|inadvertent(?:ly)?|unknowingly)\s+[\w-]{0,15}\s*(?:re-?expos\w*|re-?administ\w*|re-?start\w*|took|received)\b", re.I)
_CYCLE = re.compile(r"\b(cycle \d+|next cycle|subsequent cycle|course \d+)\b", re.I)
_CONTINUATION = re.compile(r"\b(continued (throughout|without interruption)|never (stopped|interrupted|discontinued)|maintained throughout)\b", re.I)


class RechallengeAgent(BaseAgent):
    NAME = "rechallenge_assessment"
    VERSION = "1.0.0"
    REQUIRED_RULES = ["REQ-ICH-E2B-R3-RECHALLENGE"]

    def assess(self, case: ICSR) -> object:
        return self.safe_run(self._assess, case)

    def _assess(self, case: ICSR):
        narrative = case.narrative or ""
        suspects = [d for d in case.drugs if d.role in ("suspect", "interacting")] or list(case.drugs)
        r = self.result(status=ResultStatus.CONFIRMED)
        pairs = []
        for ev in case.events:
            for drug in suspects:
                pairs.append(self._pair(drug, ev, narrative, case))
        if any(p["rechallenge"] == Rechallenge.UNRESOLVED.value for p in pairs):
            r.status = ResultStatus.UNRESOLVED
        r.payload = {"case_id": case.case_id, "drug_event_pairs": pairs,
                     "guardrail": "agent observes reported information only; it never "
                                  "recommends performing a rechallenge"}
        return r

    def _pair(self, drug, ev, narrative, case) -> dict:
        sentences = re.split(r"(?<=[.!?;])\s+", narrative)
        low = drug.name.lower()
        relevant = [s for s in sentences if low in s.lower() or _READMIN.search(s)
                    or _RECUR.search(s) or _NO_RECUR.search(s)]
        blob = " ".join(relevant) if relevant else narrative

        hypothetical = bool(_HYPOTHETICAL.search(blob))
        continuation = bool(_CONTINUATION.search(blob))
        accidental = bool(_ACCIDENTAL.search(blob))
        cyclic = bool(_CYCLE.search(blob))
        readmin = bool(_READMIN.search(blob)) and not continuation and not hypothetical
        recurred = bool(_RECUR.search(blob)) and not _NO_RECUR.search(blob)
        not_recurred = bool(_NO_RECUR.search(blob))

        note = None
        if hypothetical:
            cls, note = Rechallenge.NOT_RECHALLENGED, "rechallenge explicitly not performed / hypothetical discussion"
        elif continuation:
            cls, note = Rechallenge.NOT_RECHALLENGED, "dose continuation without interruption — not a rechallenge"
        elif not readmin:
            cls = Rechallenge.NOT_RECHALLENGED
        elif recurred:
            cls = Rechallenge.POSITIVE
            note = "re-administration and event recurrence documented"
        elif not_recurred:
            cls = Rechallenge.NEGATIVE
            note = "re-administration documented without recurrence"
        else:
            cls = Rechallenge.UNRESOLVED
            note = "re-administration documented but recurrence outcome not established"

        if accidental:
            note = (note + " | " if note else "") + "exposure appears accidental/inadvertent — distinct from deliberate clinical rechallenge"
        if cyclic and readmin:
            note = (note + " | " if note else "") + "repeated treatment-cycle context; verify this is a true rechallenge after event resolution"

        return {
            "drug": drug.name, "event": ev.verbatim,
            "rechallenge": cls.value,
            "e2b_gk9i4": E2B_GK9I4[cls],
            "readministration_documented": readmin,
            "recurrence_documented": recurred,
            "note": note,
            "evidence_quote": relevant[0].strip() if relevant else None,
        }
