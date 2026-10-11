"""Shared agent plumbing: LLM adapter protocol, evidence grounding, envelope.
Model choice is deliberately NOT hard-coded (decided by benchmark, per Nexus design)."""
from __future__ import annotations
import re, hashlib
from typing import Protocol, TypeVar
from pydantic import BaseModel

class LLMClient(Protocol):
    def complete_json(self, *, system: str, user: str, schema: dict) -> dict: ...

def _norm(s): return re.sub(r"\s+", " ", s).strip().lower()

def grounded(quote, source):
    """Hallucination guard: every extracted fact must quote the source verbatim."""
    return bool(quote) and _norm(quote) in _norm(source)

class Flag(BaseModel):
    code: str
    message: str
    needs_human_review: bool = True

def sha(text): return hashlib.sha256(text.encode()).hexdigest()

T = TypeVar("T", bound=BaseModel)

def call_structured(llm, system, user, model):
    raw = llm.complete_json(system=system, user=user, schema=model.model_json_schema())
    return model.model_validate(raw)

GROUNDING_RULES = """Rules (non-negotiable):
- Extract ONLY what the source text states. Never infer or fill from medical knowledge.
- Every item needs `evidence`: an exact verbatim quote from the source.
- If a field is not stated, return null. Do not guess dates, doses, ages, or names.
- Preserve dates at the precision given ("2019", "2019-03", "2019-03-14").
- Return JSON matching the schema only."""
