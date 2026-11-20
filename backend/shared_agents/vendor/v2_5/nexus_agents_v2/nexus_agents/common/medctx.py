"""Shared medical-context extraction + temporal classifier.
One extraction, two views (History / Current) => every item lands in exactly one bucket; nothing falls between agents.
Boundary (E2B(R3) IG G.k / D.8): concomitant = taken at time of reaction; earlier relevant drugs -> D.8;
drugs used to TREAT the event are excluded from both."""
from __future__ import annotations
import re
from enum import Enum
from pydantic import BaseModel
from .base import LLMClient, Flag, call_structured, grounded, sha, GROUNDING_RULES
from . import pdate

class Kind(str, Enum):
    condition="condition"; surgery="surgery_procedure"; family="family_history"; allergy="allergy_or_prior_reaction"
    non_drug_therapy="non_drug_therapy"       # radiotherapy, diet, dialysis (D.7.3)
    habit="habit"                             # tobacco/alcohol (reported as history/current)
class Cont(str, Enum): yes="yes"; no="no"; unknown="unknown"

class CtxCondition(BaseModel):
    term_as_reported: str; kind: Kind
    start_date: str | None = None; end_date: str | None = None
    continuing_stated: Cont = Cont.unknown
    temporal_phrase: str | None = None        # verbatim words that signal timing, e.g. "history of", "currently"
    is_the_adverse_event_itself: bool = False
    comment: str | None = None; evidence: str
class CtxDrug(BaseModel):
    name_as_reported: str
    indication: str | None = None; dose_text: str | None = None; route: str | None = None
    start_date: str | None = None; end_date: str | None = None
    continuing_stated: Cont = Cont.unknown
    temporal_phrase: str | None = None
    stated_role: str | None = None            # suspect|concomitant|interacting|treatment_of_event|unknown (as reported)
    reaction_to_this_drug_in_past: str | None = None
    evidence: str
class CtxRead(BaseModel):
    reaction_onset_date: str | None = None; reaction_onset_evidence: str | None = None
    conditions: list[CtxCondition] = []; drugs: list[CtxDrug] = []

SYSTEM = f"""Extract (a) every medical condition, surgery, family-history item, allergy/prior reaction, non-drug therapy and habit
that is NOT the current adverse event, and (b) every drug mentioned. For each copy the timing words verbatim into
`temporal_phrase`. Record `stated_role` only if the text states it (e.g. "suspect", "concomitant", "given to treat the rash").
Do NOT decide whether an item is current or historical; downstream rules do that. Exclude the adverse event itself.
{GROUNDING_RULES}"""

class Bucket(str, Enum):
    current="current"; historical="historical"; post_onset="post_onset"; unclassified="unclassified"

_PAST = re.compile(r"\b(history of|h/o|previous(ly)?|prior|past|formerly|former|had|resolved|ex-|stopped|discontinued|until|was (diagnosed|treated|on)|years? ago|in childhood|childhood)\b", re.I)
_NOW  = re.compile(r"\b(currently|current|ongoing|continues?|continuing|known|suffers?|suffering|has|have|is on|are on|on treatment|under treatment|taking|takes|since|chronic|maintained on|receiving)\b", re.I)

def classify(onset, start, end, cont, phrase):
    """Returns (bucket, reason). Date logic first (certain), then stated flag, then wording. Never guesses silently."""
    if end:
        b = pdate.before(end, onset) if onset else None
        if b is True: return Bucket.historical, "end date before reaction onset"
        if b is False: return Bucket.current, "end date on/after reaction onset"
    if start and onset and pdate.before(onset, start) is True: return Bucket.post_onset, "started after reaction onset"
    if cont is Cont.yes: return Bucket.current, "continuing stated yes"
    if cont is Cont.no and end is None and onset is None: return Bucket.historical, "continuing stated no"
    if cont is Cont.no and not end: return Bucket.historical, "stated not continuing"
    p = phrase or ""
    past, now = bool(_PAST.search(p)), bool(_NOW.search(p))
    if past and not now: return Bucket.historical, f"past-tense wording: {p!r}"
    if now and not past: return Bucket.current, f"present-tense wording: {p!r}"
    return Bucket.unclassified, "no decisive date/flag/wording"

class Item(BaseModel):
    payload: dict; bucket: Bucket; reason: str
class MedCtxResult(BaseModel):
    agent: str; agent_version: str = "0.1.0"; rulepack_version: str = "ctx-rules-2026.10-draft"
    input_sha256: str; reaction_onset_date: str | None
    conditions: list[Item]; drugs: list[Item]
    excluded_treatment_of_event: list[dict] = []; flags: list[Flag] = []

def extract(llm: LLMClient, source: str) -> CtxRead:
    return call_structured(llm, SYSTEM, source, CtxRead)

def partition(source: str, read: CtxRead, onset_override: str | None = None):
    """Grounds + classifies everything once. Returns (conditions, drugs, treatment_excl, flags, onset)."""
    flags = []; onset = onset_override or read.reaction_onset_date
    if not onset_override and onset and not grounded(read.reaction_onset_evidence, source):
        flags.append(Flag(code="ONSET_UNGROUNDED", message="Reaction onset not verbatim; ignored")); onset = None
    if not onset: flags.append(Flag(code="NO_ONSET", message="Reaction onset unknown: classification relies on stated flags/wording only"))
    conds, drugs, tx = [], [], []
    for c in read.conditions:
        if c.is_the_adverse_event_itself: continue
        if not grounded(c.evidence, source): flags.append(Flag(code="UNGROUNDED", message=f"Condition \"{c.term_as_reported}\" dropped")); continue
        b, why = classify(onset, c.start_date, c.end_date, c.continuing_stated, c.temporal_phrase)
        if b is Bucket.unclassified: flags.append(Flag(code="UNCLASSIFIED", message=f"\"{c.term_as_reported}\": {why}"))
        conds.append(Item(payload=c.model_dump(mode="json"), bucket=b, reason=why))
    for d in read.drugs:
        if not grounded(d.evidence, source): flags.append(Flag(code="UNGROUNDED", message=f"Drug \"{d.name_as_reported}\" dropped")); continue
        role = (d.stated_role or "").lower()
        if "treat" in role: tx.append(d.model_dump(mode="json")); continue      # excluded per E2B IG G.k
        b, why = classify(onset, d.start_date, d.end_date, d.continuing_stated, d.temporal_phrase)
        if b is Bucket.unclassified: flags.append(Flag(code="UNCLASSIFIED", message=f"\"{d.name_as_reported}\": {why}"))
        drugs.append(Item(payload=d.model_dump(mode="json"), bucket=b, reason=why))
    return conds, drugs, tx, flags, onset
