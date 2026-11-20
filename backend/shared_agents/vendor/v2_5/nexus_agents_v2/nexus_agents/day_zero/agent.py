"""Day Zero Identifier.

LLM role  : read each receipt event and report which of the 4 minimum ICSR criteria it contains (with quotes).
Rules role: compute day zero, validity, follow-up clock, and due dates. Dates are NEVER computed by the LLM.
Knowledge : knowledge/01_day_zero.md (GVP Module VI.B.7, VI App2 literature rules).
"""
from __future__ import annotations
from enum import Enum
from pydantic import BaseModel, Field
from ..common.base import LLMClient, Flag, call_structured, grounded, sha, GROUNDING_RULES
from ..common import pdate

AGENT, VERSION, RULEPACK = "day_zero", "0.1.0", "dz-rules-2026.10-draft"

class SourceType(str, Enum):
    spontaneous = "spontaneous"; solicited = "solicited"; clinical_trial = "clinical_trial"
    literature_global = "literature_global"   # MAH-run systematic search (e.g. weekly)
    literature_local = "literature_local"     # local/affiliate literature
    regulator = "regulator"; partner = "partner"; digital_media = "digital_media"

class ReporterPolicy(str, Enum):
    any_one = "any_one"                       # name|initials|address|contact (default; needs sign-off)
    name_or_initials_and_qualification = "name_or_initials_and_qualification"

class Receipt(BaseModel):
    event_id: str
    date: str = Field(description="YYYY-MM-DD: date info reached ANY MAH personnel/contractor")
    received_by: str = "mah"                  # mah | affiliate | contractor | partner
    text: str

class Region(BaseModel):
    name: str = "EU"
    serious_days: int = 15
    nonserious_days: int | None = 90          # None = no non-serious expedited clock (e.g. US IND/NDA path differs)

class DayZeroInput(BaseModel):
    case_id: str
    source_type: SourceType
    receipts: list[Receipt]                   # chronological
    search_date: str | None = None            # literature: date the search was run
    fulltext_received_date: str | None = None # literature: date full text obtained
    seriousness: bool | None = None           # from Seriousness Agent; None = unknown
    region: Region = Region()
    reporter_policy: ReporterPolicy = ReporterPolicy.any_one

# ---- LLM extraction schema ----
class Crit(BaseModel):
    present: bool
    evidence: str | None = None
class EventRead(BaseModel):
    event_id: str
    reporter: Crit; patient: Crit; product: Crit; reaction: Crit
    reporter_has_qualification: bool = False
    reporter_has_name_or_initials: bool = False
    in_abstract_only: bool | None = None      # literature: criteria visible in abstract/title
    is_followup_significant: bool | None = None
    followup_reason: str | None = None        # new_suspect|new_reaction|seriousness_change|outcome|dechallenge|other
class LLMRead(BaseModel):
    events: list[EventRead]

SYSTEM = f"""You are a pharmacovigilance intake analyst. For each receipt event decide which of the four ICSR minimum
criteria the text contains: identifiable reporter, identifiable patient (initials/ID/DOB/age/age group/sex/weight/height/
gestation period count), a suspect medicinal product, a suspected adverse reaction. Mark `present` only if explicitly
supported. Reaction must be linked to the product by the reporter or text; a bare list of drugs and a bare list of events
with no association is NOT enough. Also flag whether later events add significant new info.
{GROUNDING_RULES}"""

# ---- output ----
class Criterion(BaseModel):
    name: str; first_available: str | None; event_id: str | None; evidence: str | None

class DayZeroResult(BaseModel):
    agent: str = AGENT; agent_version: str = VERSION; rulepack_version: str = RULEPACK
    input_sha256: str
    valid_icsr: bool
    day_zero: str | None
    day_zero_basis: str
    missing_criteria: list[str]
    criteria: list[Criterion]
    due_date_serious: str | None = None
    due_date_nonserious: str | None = None
    applicable_due_date: str | None = None
    followup_clock_starts: list[dict] = []
    flags: list[Flag] = []

def _reporter_ok(r: EventRead, pol: ReporterPolicy) -> bool:
    if not r.reporter.present: return False
    if pol is ReporterPolicy.any_one: return True
    return r.reporter_has_name_or_initials and r.reporter_has_qualification

def compute(inp: DayZeroInput, reads: LLMRead) -> DayZeroResult:
    flags: list[Flag] = []
    by_id = {r.event_id: r for r in reads.events}
    srcs = {r.event_id: r for r in inp.receipts}
    first: dict[str, tuple[str, str, str | None]] = {}   # criterion -> (date, event, evidence)

    for rc in inp.receipts:
        r = by_id.get(rc.event_id)
        if not r:
            flags.append(Flag(code="NO_READ", message=f"No extraction for {rc.event_id}")); continue
        eff = rc.date
        # Literature rules (GVP VI App2): global search -> date search run; else date info available.
        if inp.source_type is SourceType.literature_global:
            if r.in_abstract_only and inp.search_date: eff = inp.search_date
            elif inp.fulltext_received_date: eff = inp.fulltext_received_date
            elif not inp.search_date: flags.append(Flag(code="LIT_DATE_MISSING", message="Literature case without search/full-text date"))
        elif inp.source_type is SourceType.literature_local and inp.fulltext_received_date:
            flags.append(Flag(code="LOCAL_LIT_AMBIGUOUS", message="Local-literature day zero is interpreted differently by authorities; confirm policy"))
        checks = {"reporter": (_reporter_ok(r, inp.reporter_policy), r.reporter),
                  "patient": (r.patient.present, r.patient),
                  "product": (r.product.present, r.product),
                  "reaction": (r.reaction.present, r.reaction)}
        for name, (ok, crit) in checks.items():
            if not ok: continue
            if not grounded(crit.evidence, rc.text):
                flags.append(Flag(code="UNGROUNDED", message=f"{name} evidence not found verbatim in {rc.event_id}; ignored")); continue
            if name not in first or eff < first[name][0]:
                first[name] = (eff, rc.event_id, crit.evidence)

    names = ["reporter", "patient", "product", "reaction"]
    crits = [Criterion(name=n, first_available=first[n][0] if n in first else None,
                       event_id=first[n][1] if n in first else None, evidence=first[n][2] if n in first else None) for n in names]
    missing = [n for n in names if n not in first]
    res = DayZeroResult(input_sha256=sha(inp.model_dump_json()), valid_icsr=not missing, day_zero=None,
                        day_zero_basis="", missing_criteria=missing, criteria=crits, flags=flags)
    if missing:
        res.day_zero_basis = "Incomplete: follow up for missing criteria; clock not started."
        res.flags.append(Flag(code="INVALID_ICSR", message=f"Missing: {', '.join(missing)}", needs_human_review=False))
        return res

    # Day zero = date the LAST missing criterion became available (all four now present).
    res.day_zero = max(v[0] for v in first.values())
    res.day_zero_basis = ("Date minimum criteria became available to any MAH personnel/contractor (GVP VI.B.7); "
                          "criteria may be assembled across contacts.")
    if inp.source_type is SourceType.literature_global:
        res.day_zero_basis += " Literature: search date if criteria in abstract, else full-text receipt (VI App2)."
    if inp.source_type is SourceType.regulator:
        res.flags.append(Flag(code="REG_SOURCE", message="Confirm day zero = receipt from authority, not authority's own date"))

    rg = inp.region
    res.due_date_serious = pdate.add_days(res.day_zero, rg.serious_days)
    res.due_date_nonserious = pdate.add_days(res.day_zero, rg.nonserious_days) if rg.nonserious_days else None
    if inp.seriousness is True: res.applicable_due_date = res.due_date_serious
    elif inp.seriousness is False: res.applicable_due_date = res.due_date_nonserious
    else: res.flags.append(Flag(code="SERIOUSNESS_UNKNOWN", message="Both due dates given; apply the earlier until seriousness is assessed"))

    # Follow-up: clock restarts on receipt of SIGNIFICANT new info (GVP VI.B.7).
    for rc in inp.receipts:
        r = by_id.get(rc.event_id)
        if r and r.is_followup_significant and rc.date > res.day_zero:
            res.followup_clock_starts.append({"event_id": rc.event_id, "date": rc.date, "reason": r.followup_reason,
                "due_if_serious": pdate.add_days(rc.date, rg.serious_days)})
    return res

class DayZeroAgent:
    def __init__(self, llm: LLMClient): self.llm = llm
    def run(self, inp: DayZeroInput) -> DayZeroResult:
        user = "\n\n".join(f"[EVENT {r.event_id} | received {r.date} by {r.received_by}]\n{r.text}" for r in inp.receipts)
        user += f"\n\nSource type: {inp.source_type.value}"
        return compute(inp, call_structured(self.llm, SYSTEM, user, LLMRead))
