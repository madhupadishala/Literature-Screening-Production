"""Deterministic text/identifier normalisation utilities (Agent 1 & 2 foundations)."""
from __future__ import annotations

import re
from difflib import SequenceMatcher

_DOI_PREFIXES = ("https://doi.org/", "http://doi.org/", "doi.org/", "doi:", "doi ")


def normalize_doi(doi: str | None) -> str | None:
    if not doi:
        return None
    d = doi.strip().lower()
    for p in _DOI_PREFIXES:
        if d.startswith(p):
            d = d[len(p):]
            break
    d = d.strip().rstrip(".;,")
    return d or None


def normalize_pmid(pmid: str | None) -> str | None:
    if not pmid:
        return None
    digits = re.sub(r"\D", "", str(pmid))
    return digits or None


_PUNCT = re.compile(r"[^a-z0-9 ]+")
_WS = re.compile(r"\s+")


def normalize_title(title: str | None) -> str:
    if not title:
        return ""
    t = _PUNCT.sub(" ", title.lower())
    return _WS.sub(" ", t).strip()


def title_similarity(a: str | None, b: str | None) -> float:
    na, nb = normalize_title(a), normalize_title(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    return SequenceMatcher(None, na, nb).ratio()


def token_jaccard(a: str | None, b: str | None) -> float:
    ta, tb = set(normalize_title(a).split()), set(normalize_title(b).split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def normalize_author(name: str) -> str:
    n = normalize_title(name)
    parts = n.split()
    return parts[0] if parts else ""  # surname key


def author_overlap(a: list[str], b: list[str]) -> float:
    sa = {normalize_author(x) for x in a if normalize_author(x)}
    sb = {normalize_author(x) for x in b if normalize_author(x)}
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / max(len(sa), len(sb))
