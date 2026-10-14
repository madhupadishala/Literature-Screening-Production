"""Shared text helpers: sentence bounds, negation detection, patient indicators.

Pure functions. No I/O, no logging of source text (source text may contain PHI).
"""
from __future__ import annotations

import re
from typing import Dict, List, Tuple

_BOUNDARY = re.compile(r"(?<!\d)[.;!?](?!\d)|\n")

NEG_PRE = re.compile(
    r"\b(?:no|not|never|without|denied|denies|negative for|absence of|absent|"
    r"free of|ruled out|no evidence of|no signs? of|no history of|did not|"
    r"didn't|was not|were not|neither|nor)\b",
    re.I,
)
NEG_POST = re.compile(
    r"^[^.;!?]{0,25}\b(?:ruled out|excluded|absent|not (?:observed|seen|present|reported))",
    re.I,
)
_CONTRAST = re.compile(r"\b(?:but|however|although|except|whereas)\b", re.I)


def sentence_bounds(text: str, start: int, end: int) -> Tuple[int, int]:
    """Return (start, end) offsets of the sentence containing text[start:end]."""
    left = 0
    for m in _BOUNDARY.finditer(text, 0, start):
        left = m.end()
    m = _BOUNDARY.search(text, end)
    right = m.start() if m else len(text)
    return left, right


def is_negated(text: str, start: int, end: int) -> bool:
    """True if the span at text[start:end] is negated within its sentence."""
    s, e = sentence_bounds(text, start, end)
    pre = _CONTRAST.split(text[s:start])[-1][-60:]
    if NEG_PRE.search(pre):
        return True
    return bool(NEG_POST.match(text[end:e]))


# ---------------------------------------------------------------- patient indicators
_AGE = re.compile(
    r"\b\d{1,3}[- ]?(?:year|yr)s?[- ]?old\b"
    r"|\baged?\s+\d{1,3}\b"
    r"|\b\d{1,2}[- ]?(?:month|week|day)s?[- ]?old\b"
    r"|\b\d{1,3}\s?(?:y/o|yo)\b",
    re.I,
)
_AGE_RANGE_AFTER = re.compile(r"^\s*(?:-|–|to|and)\s*\d")
_AGE_AGGREGATE_BEFORE = re.compile(r"(?:mean|median|average)\s+$", re.I)
_AGEGROUP = re.compile(
    r"\b(?:a|an)\s+(?:[\w-]+[- ]){0,2}(?:neonate|newborn|infant|toddler|child|"
    r"adolescent|teenager|adult)\b",
    re.I,
)
_SEX = re.compile(
    r"\b(?:a|an|the|this)\s+(?:[\w-]+\s+){0,3}?(?:man|woman|male|female|boy|girl)\b"
    r"|\bold\s+(?:man|woman|male|female|boy|girl)\b",
    re.I,
)
_INITIALS = re.compile(r"\b(?:[Pp]atient|[Pp]t)\.?\s+((?:[A-Z]\.?){2,3})\b")
_INITIALS_STOP = {"ID", "IV", "ER", "ICU", "IM", "PO", "OR", "AE"}
_PID = re.compile(r"\b(?:patient|case|subject|pt)\s*(?:no\.?|number|#|id)?\s*[:#]?\s*\d+\b", re.I)
_DOB = re.compile(r"\b(?:date of birth|dob|born (?:on|in))\b", re.I)


def patient_indicators(text: str) -> List[Dict]:
    """Individual-level identifiers (age, age group, sex, initials, id, DOB).

    Returns dicts: {"kind", "start", "end"}. Aggregate phrasing such as
    "aged 18 to 65" or "mean age 45" is excluded.
    """
    out: List[Dict] = []
    for m in _AGE.finditer(text):
        if _AGE_RANGE_AFTER.match(text[m.end():m.end() + 8]):
            continue
        if _AGE_AGGREGATE_BEFORE.search(text[max(0, m.start() - 8):m.start()]):
            continue
        out.append({"kind": "age", "start": m.start(), "end": m.end()})
    for m in _AGEGROUP.finditer(text):
        out.append({"kind": "age_group", "start": m.start(), "end": m.end()})
    for m in _SEX.finditer(text):
        out.append({"kind": "sex", "start": m.start(), "end": m.end()})
    for m in _INITIALS.finditer(text):
        if m.group(1).replace(".", "") not in _INITIALS_STOP:
            out.append({"kind": "initials", "start": m.start(), "end": m.end()})
    for m in _PID.finditer(text):
        out.append({"kind": "patient_id", "start": m.start(), "end": m.end()})
    for m in _DOB.finditer(text):
        out.append({"kind": "date_of_birth", "start": m.start(), "end": m.end()})
    return out
