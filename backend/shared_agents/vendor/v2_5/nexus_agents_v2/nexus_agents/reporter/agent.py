"""Reporter Information Extractor -> E2B(R3) C.2.r. Knowledge: knowledge/05_reporter.md"""
from __future__ import annotations
import re
from pydantic import BaseModel
from ..common.base import LLMClient, Flag, call_structured, grounded, sha, GROUNDING_RULES
AGENT, VERSION, RULEPACK = "reporter", "0.1.0", "rep-rules-2026.10-draft"

class ReporterRaw(BaseModel):
    given_name: str | None = None; family_name: str | None = None; initials: str | None = None
    organisation: str | None = None; department: str | None = None
    street: str | None = None; city: str | None = None; state: str | None = None; postcode: str | None = None
    country: str | None = None; telephone: str | None = None; email: str | None = None
    occupation_as_stated: str | None = None      # verbatim: "treating neurologist", "mother of patient"
    is_patient_or_relative: bool | None = None
    evidence: str
class ReporterRead(BaseModel):
    reporters: list[ReporterRaw]
    patient_is_reporter: bool | None = None

SYSTEM = f"""Extract every person who supplied the safety information (primary sources), NOT the patient unless the patient
reported it themselves, and NOT sender/company staff who merely forwarded it. Copy occupation exactly as stated.
{GROUNDING_RULES}"""

# E2B(R3) C.2.r.4 qualification: 1 Physician 2 Pharmacist 3 Other health professional 4 Lawyer 5 Consumer/other non-HCP
_Q = [(1, r"\b(physician|doctor|dr\.?|md|gp|general practitioner|surgeon|consultant|specialist|neurologist|cardiologist|oncologist|psychiatrist|paediatrician|pediatrician|dermatologist|resident|intern)\b"),
      (2, r"\b(pharmacist|pharmacy|chemist)\b"),
      (4, r"\b(lawyer|attorney|solicitor|advocate)\b"),
      (3, r"\b(nurse|dentist|midwife|physiotherapist|paramedic|technician|health ?care (professional|worker)|hcp|optometrist|coroner)\b"),
      (5, r"\b(patient|consumer|mother|father|parent|spouse|wife|husband|son|daughter|friend|caregiver|relative|self|layperson|non-health)\b")]
def qualify(text):
    t = (text or "").lower()
    for code, rx in _Q:
        if re.search(rx, t): return code
    return None

_C = {"india":"IN","united states":"US","usa":"US","u.s.":"US","united kingdom":"GB","uk":"GB","germany":"DE","france":"FR","japan":"JP","china":"CN",
      "italy":"IT","spain":"ES","canada":"CA","australia":"AU","brazil":"BR","netherlands":"NL","belgium":"BE","switzerland":"CH","ireland":"IE"}
def country_iso(s):
    if not s: return None
    t = s.strip()
    if re.fullmatch(r"[A-Z]{2}", t): return t
    return _C.get(t.lower())    # unknown -> None + flag (never guess)

class Reporter(BaseModel):
    given_name: str | None; family_name: str | None; initials: str | None
    organisation: str | None; department: str | None
    street: str | None; city: str | None; state: str | None; postcode: str | None
    country_iso2: str | None; telephone: str | None; email: str | None
    qualification_code: int | None; qualification_text: str | None
    primary_source_for_regulatory_purposes: bool = False
    evidence: str
class ReporterResult(BaseModel):
    agent: str = AGENT; agent_version: str = VERSION; rulepack_version: str = RULEPACK
    input_sha256: str; reporters: list[Reporter]; reporter_identifiable: bool
    contains_personal_data: bool = True; flags: list[Flag] = []

def assemble(source: str, read: ReporterRead) -> ReporterResult:
    flags, out = [], []
    for r in read.reporters:
        if not grounded(r.evidence, source):
            flags.append(Flag(code="UNGROUNDED", message="Reporter dropped: evidence not verbatim in source")); continue
        occ = r.occupation_as_stated
        q = qualify(occ) if occ else None
        if r.is_patient_or_relative and q in (None,): q = 5
        if occ and q is None: flags.append(Flag(code="QUAL_UNMAPPED", message=f"Qualification \"{occ}\" not mapped; human to code"))
        iso = country_iso(r.country)
        if r.country and not iso: flags.append(Flag(code="COUNTRY_UNMAPPED", message=f"Country \"{r.country}\" not mapped to ISO-3166"))
        out.append(Reporter(**r.model_dump(exclude={"country","occupation_as_stated","is_patient_or_relative"}),
                            country_iso2=iso, qualification_code=q, qualification_text=occ))
    # Primary source for regulatory purposes: default = first HCP (codes 1-3) by report order, else first reporter.
    # (Policy choice - listed for approval in knowledge doc.)
    if out:
        idx = next((i for i,x in enumerate(out) if x.qualification_code in (1,2,3)), 0)
        out[idx].primary_source_for_regulatory_purposes = True
        if len({x.qualification_code for x in out}) > 1:
            flags.append(Flag(code="MULTI_REPORTER", message="Multiple reporters; primary-source selection is rule-based, confirm", needs_human_review=True))
    ident = any(x.family_name or x.given_name or x.initials or x.street or x.city or x.telephone or x.email or x.organisation for x in out)
    if not out: flags.append(Flag(code="NO_REPORTER", message="No identifiable reporter found"))
    return ReporterResult(input_sha256=sha(source), reporters=out, reporter_identifiable=ident, flags=flags)

class ReporterAgent:
    def __init__(self, llm: LLMClient): self.llm = llm
    def run(self, source: str) -> ReporterResult:
        return assemble(source, call_structured(self.llm, SYSTEM, source, ReporterRead))
