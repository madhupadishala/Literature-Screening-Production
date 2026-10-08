"""Deterministic, authoritative decision logic. Pure function: no I/O, no LLM.

Asymmetric by design: a serious call needs verified evidence; a non-serious call needs
every channel to agree on absence. Anything else escalates to a human.
"""
from dataclasses import dataclass, field

from .schemas import Criterion

# llm_state values: present | absent | unknown | disagree | unverified | other_experiencer | failed


@dataclass
class Evidence:
    llm_state: str
    quote: str | None = None
    lexical_hits: list[str] = field(default_factory=list)   # NON-negated lexical hits only
    ime_terms: list[str] = field(default_factory=list)


@dataclass
class RuleResult:
    decision: str                     # serious | non_serious | needs_review
    met: list[Criterion]
    reasons: list[str]


def criterion_met(ev: Evidence) -> bool:
    return ev.llm_state == "present" or bool(ev.ime_terms)


def evaluate(evidence: dict[Criterion, Evidence], reporter_serious: bool | None,
             insufficient: bool, extraction_error: bool) -> RuleResult:
    met = [c for c, ev in evidence.items() if criterion_met(ev)]
    if met or reporter_serious:
        return RuleResult("serious", met, ["reporter_assessed_serious"] if reporter_serious and not met else [])

    reasons: list[str] = []
    if insufficient:
        reasons.append("insufficient_information")
    if extraction_error:
        reasons.append("extraction_error")
    for c, ev in evidence.items():
        if ev.llm_state in ("unknown", "disagree", "unverified", "other_experiencer", "failed"):
            reasons.append(f"{c.value}:{ev.llm_state}")
        if ev.lexical_hits:
            reasons.append(f"{c.value}:lexical_candidate_not_confirmed")
    return RuleResult("needs_review" if reasons else "non_serious", [], reasons)
