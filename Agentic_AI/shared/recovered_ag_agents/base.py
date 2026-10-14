"""Shared contract for AG07, AG16, AG25 and AG27.

Pattern (mirrors the Literature-Screening-Production conventions):
  1. mandatory GxP audit reason (generic reasons rejected)
  2. deterministic rule pass (always runs)
  3. optional LLM pass; every LLM finding must quote the source verbatim or it
     is discarded (grounding / "source-exact" rule)
  4. deterministic reconciliation of rule vs LLM output
  5. human-review gate: low confidence, LLM-only findings or negative
     determinations always set needs_human_review

Agents are pure: no network, no persistence, no logging of source text.
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol, Tuple

AGENT_VERSION = "0.1.0-draft"
REVIEW_THRESHOLD = 0.75
CONFIG_DIR = Path(__file__).parent / "config"

_GENERIC_REASONS = {
    "test", "testing", "ok", "okay", "na", "n/a", "none", "done", "update",
    "updated", "review", "as required", "required", "routine", "check", "run",
}


class AuditReasonError(ValueError):
    """Raised when the GxP audit reason is missing or generic."""


def validate_audit_reason(reason: Any) -> str:
    if not isinstance(reason, str):
        raise AuditReasonError("A GxP audit reason is required.")
    cleaned = " ".join(reason.split())
    if (
        len(cleaned) < 15
        or len(cleaned.split()) < 3
        or cleaned.lower().strip(".") in _GENERIC_REASONS
    ):
        raise AuditReasonError(
            "Audit reason is too generic; state the meaningful business/regulatory reason."
        )
    return cleaned


def load_config(name: str) -> Dict[str, Any]:
    with open(CONFIG_DIR / name, encoding="utf-8") as fh:
        return json.load(fh)


class LLMProvider(Protocol):
    """Inject any provider (Groq, Azure OpenAI, ...) that exposes complete()."""

    def complete(self, system: str, user: str) -> str: ...


@dataclass
class Evidence:
    quote: str
    start: int
    end: int
    field: str = ""


def find_evidence(text: str, quote: Any, field_name: str = "") -> Optional[Evidence]:
    """Locate `quote` in `text` (whitespace/case-insensitive). None if absent."""
    if not isinstance(quote, str) or len(quote.strip()) < 3:
        return None
    parts = [re.escape(p) for p in quote.split()]
    m = re.search(r"\s+".join(parts), text, re.I)
    if not m:
        return None
    return Evidence(text[m.start():m.end()], m.start(), m.end(), field_name)


def evidence_from_span(text: str, start: int, end: int, field_name: str = "",
                       whole_sentence: bool = True, max_len: int = 300) -> Evidence:
    from .patterns import sentence_bounds

    if whole_sentence:
        s, e = sentence_bounds(text, start, end)
        if e - s > max_len:
            s, e = start, end
    else:
        s, e = start, end
    return Evidence(text[s:e].strip(), s, e, field_name)


def parse_json(raw: Any) -> Optional[Dict[str, Any]]:
    """Parse a JSON object out of an LLM reply (tolerates code fences)."""
    if not isinstance(raw, str):
        return None
    cleaned = re.sub(r"```(?:json)?", "", raw).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        obj = json.loads(cleaned[start:end + 1])
    except ValueError:
        return None
    return obj if isinstance(obj, dict) else None


@dataclass
class Draft:
    status: str
    data: Dict[str, Any]
    evidence: List[Evidence] = field(default_factory=list)
    confidence: float = 0.0
    review_reasons: List[str] = field(default_factory=list)


@dataclass
class AgentResult:
    agent_id: str
    agent_name: str
    agent_version: str
    status: str
    data: Dict[str, Any]
    evidence: List[Dict[str, Any]]
    confidence: float
    needs_human_review: bool
    review_reasons: List[str]
    auto_release_allowed: bool
    audit: Dict[str, str]
    llm: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class BaseAgent:
    agent_id = ""
    name = ""

    def __init__(self, llm: Optional[LLMProvider] = None,
                 review_threshold: float = REVIEW_THRESHOLD) -> None:
        self.llm = llm
        self.review_threshold = review_threshold

    # ---- to be implemented by each agent
    def deterministic(self, text: str, context: Dict[str, Any]) -> Draft:
        raise NotImplementedError

    def llm_prompt(self, text: str, context: Dict[str, Any]) -> Tuple[str, str]:
        raise NotImplementedError

    def reconcile(self, text: str, context: Dict[str, Any], draft: Draft,
                  payload: Dict[str, Any], notes: List[str]) -> Draft:
        return draft

    # ---- orchestration
    def run(self, text: str, audit_reason: str,
            context: Optional[Dict[str, Any]] = None) -> AgentResult:
        reason = validate_audit_reason(audit_reason)
        context = dict(context or {})
        text = text or ""
        if not text.strip():
            draft = Draft("NO_INPUT", {}, [], 0.0, ["Empty input text."])
            return self._finish(draft, reason, False, [])

        draft = self.deterministic(text, context)
        used, notes = False, []
        if self.llm is not None:
            payload, notes = self._call_llm(text, context)
            if payload is None:
                draft.review_reasons.append("LLM step unavailable or invalid; rule-based result only.")
            else:
                used = True
                draft = self.reconcile(text, context, draft, payload, notes)
        return self._finish(draft, reason, used, notes)

    def _call_llm(self, text: str, context: Dict[str, Any]):
        notes: List[str] = []
        try:
            system, user = self.llm_prompt(text, context)
            raw = self.llm.complete(system, user)  # type: ignore[union-attr]
        except Exception as exc:  # provider failures must never break the gate
            notes.append(f"LLM call failed: {type(exc).__name__}")
            return None, notes
        payload = parse_json(raw)
        if payload is None:
            notes.append("LLM output was not valid JSON; ignored.")
        return payload, notes

    def _finish(self, draft: Draft, reason: str, used: bool, notes: List[str]) -> AgentResult:
        reasons = list(dict.fromkeys(draft.review_reasons))
        if draft.confidence < self.review_threshold and not reasons:
            reasons.append("Confidence below review threshold.")
        needs_review = bool(reasons) or draft.confidence < self.review_threshold
        return AgentResult(
            agent_id=self.agent_id,
            agent_name=self.name,
            agent_version=AGENT_VERSION,
            status=draft.status,
            data=draft.data,
            evidence=[asdict(e) for e in draft.evidence],
            confidence=round(draft.confidence, 3),
            needs_human_review=needs_review,
            review_reasons=reasons,
            auto_release_allowed=not needs_review,
            audit={"reason": reason, "utc": datetime.now(timezone.utc).isoformat()},
            llm={"used": used, "notes": notes},
        )
