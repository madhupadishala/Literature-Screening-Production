import re


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def quote_verified(quote: str | None, narrative: str) -> bool:
    """Grounding check: an LLM 'present' claim only counts if its quote exists verbatim in the source."""
    if not quote:
        return False
    q = _norm(quote)
    return len(q) >= 4 and q in _norm(narrative)
