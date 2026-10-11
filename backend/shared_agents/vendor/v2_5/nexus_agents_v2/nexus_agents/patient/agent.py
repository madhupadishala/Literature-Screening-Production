"""Patient Information Extractor -> E2B(R3) D.1-D.6. Knowledge: knowledge/04_patient.md
Medical history (D.7) and past drugs (D.8) belong to the History/Current agents."""
from __future__ import annotations
from pydantic import BaseModel
from ..common.base import LLMClient, Flag, call_structured, grounded, sha, GROUNDING_RULES
from ..common import pdate
AGENT, VERSION, RULEPACK = "patient", "0.1.0", "pat-rules-2026.10-draft"

class Num(BaseModel):
    value: float; unit: str; evidence: str
class PatientRead(BaseModel):
    initials: str | None = None; patient_id: str | None = None
    sex_as_stated: str | None = None; sex_evidence: str | None = None
    birth_date: str | None = None; birth_date_evidence: str | None = None
    age_at_onset: Num | None = None            # unit as stated: years/months/weeks/days/hours
    age_group_as_stated: str | None = None; age_group_evidence: str | None = None
    gestation_weeks_at_exposure: float | None = None; gestation_evidence: str | None = None
    weight: Num | None = None; height: Num | None = None
    last_menstrual_period: str | None = None
    reaction_onset_date: str | None = None     # only if stated; used for consistency checks
    patient_is_pregnant_or_breastfeeding_mentioned: bool = False
SYSTEM = f"""Extract patient demographics only (not history, not drugs). Keep units exactly as written. Do not convert.
Do not derive age from birth date or vice versa. Do not extract the patient full name; initials or ID only.
{GROUNDING_RULES}"""

_UCUM = {"year":"a","years":"a","yr":"a","yrs":"a","y":"a","month":"mo","months":"mo","mo":"mo","week":"wk","weeks":"wk","wk":"wk",
         "day":"d","days":"d","d":"d","hour":"h","hours":"h","h":"h"}
_SEX = {"male":1,"m":1,"man":1,"boy":1,"female":2,"f":2,"woman":2,"girl":2,"unknown":0}
_AG = {"foetus":1,"fetus":1,"neonate":2,"newborn":2,"infant":3,"child":4,"paediatric":4,"pediatric":4,"adolescent":5,"teenager":5,"adult":6,"elderly":7,"geriatric":7}

class Patient(BaseModel):
    initials: str | None; patient_id: str | None
    sex_code: int | None
    birth_date: str | None
    age_at_onset_value: float | None; age_at_onset_ucum: str | None
    age_group_reported_code: int | None
    age_group_derived_code: int | None          # DERIVED label; never written to D.2.3 as reported
    gestation_weeks: float | None
    weight_kg: float | None; height_cm: float | None
    last_menstrual_period: str | None
    patient_identifiable: bool
class PatientResult(BaseModel):
    agent: str = AGENT; agent_version: str = VERSION; rulepack_version: str = RULEPACK
    input_sha256: str; patient: Patient; pregnancy_or_breastfeeding_mentioned: bool
    contains_personal_data: bool = True; flags: list[Flag] = []

def _wt(n):
    if not n: return None
    u = n.unit.lower().strip(".")
    return {"kg":1.0,"kgs":1.0,"g":0.001,"lb":0.45359237,"lbs":0.45359237,"pounds":0.45359237}.get(u), n.value
def _ht(n):
    if not n: return None
    u = n.unit.lower().strip(".")
    return {"cm":1.0,"m":100.0,"in":2.54,"inch":2.54,"inches":2.54}.get(u), n.value

def derive_group(v, ucum):
    if v is None or not ucum: return None
    y = {"a":v,"mo":v/12,"wk":v/52,"d":v/365,"h":v/8760}[ucum]
    # ICH E2D / E11 style bands; FLAG: confirm against company convention
    if y < 28/365: return 2
    if y < 2: return 3
    if y < 12: return 4
    if y < 18: return 5
    if y < 65: return 6
    return 7

def assemble(source: str, r: PatientRead) -> PatientResult:
    f = []
    def ok(ev, name):
        if ev and not grounded(ev, source): f.append(Flag(code="UNGROUNDED", message=f"{name} dropped: evidence not verbatim")); return False
        return True
    sex = _SEX.get((r.sex_as_stated or "").lower()) if r.sex_as_stated and ok(r.sex_evidence,"sex") else None
    if r.sex_as_stated and sex is None: f.append(Flag(code="SEX_UNMAPPED", message=f"Sex \"{r.sex_as_stated}\" not mapped"))
    bd = r.birth_date if r.birth_date and ok(r.birth_date_evidence,"birth_date") and pdate.parse(r.birth_date) else None
    if r.birth_date and not bd: f.append(Flag(code="BAD_BIRTHDATE", message=f"Birth date \"{r.birth_date}\" invalid/ungrounded"))
    av = au = None
    if r.age_at_onset:
        if ok(r.age_at_onset.evidence,"age"):
            au = _UCUM.get(r.age_at_onset.unit.lower().strip("."))
            av = r.age_at_onset.value
            if au is None: f.append(Flag(code="AGE_UNIT", message=f"Age unit \"{r.age_at_onset.unit}\" unknown")); av = None
            if av is not None and (av < 0 or (au=="a" and av > 120)): f.append(Flag(code="AGE_IMPLAUSIBLE", message=f"Age {av}{au}")); 
    agr = _AG.get((r.age_group_as_stated or "").lower()) if r.age_group_as_stated and ok(r.age_group_evidence,"age_group") else None
    ad = derive_group(av, au)
    if agr and ad and agr != ad: f.append(Flag(code="AGE_GROUP_MISMATCH", message=f"Reported group {agr} vs derived {ad}"))
    # birth date vs age consistency (when onset date known)
    if bd and av is not None and au == "a" and r.reaction_onset_date and pdate.parse(bd) and pdate.parse(r.reaction_onset_date):
        by, oy = pdate.parse(bd)[0], pdate.parse(r.reaction_onset_date)[0]
        if abs((oy - by) - av) > 1: f.append(Flag(code="AGE_DOB_INCONSISTENT", message=f"DOB {bd}, onset {r.reaction_onset_date}, age {av}"))
    w = h = None
    if r.weight and ok(r.weight.evidence,"weight"):
        m, v = _wt(r.weight); w = round(v*m,2) if m else None
        if not m: f.append(Flag(code="WEIGHT_UNIT", message=f"Weight unit \"{r.weight.unit}\""))
        elif not (0.3 <= w <= 500): f.append(Flag(code="WEIGHT_IMPLAUSIBLE", message=f"{w} kg"))
    if r.height and ok(r.height.evidence,"height"):
        m, v = _ht(r.height); h = round(v*m,1) if m else None
        if not m: f.append(Flag(code="HEIGHT_UNIT", message=f"Height unit \"{r.height.unit}\""))
        elif not (20 <= h <= 260): f.append(Flag(code="HEIGHT_IMPLAUSIBLE", message=f"{h} cm"))
    gw = r.gestation_weeks_at_exposure if ok(r.gestation_evidence,"gestation") else None
    ident = any(x is not None for x in (r.initials, r.patient_id, bd, av, agr, gw, sex, w, h))
    if not ident: f.append(Flag(code="PATIENT_NOT_IDENTIFIABLE", message="No patient identifier/age/sex/etc. found"))
    p = Patient(initials=r.initials, patient_id=r.patient_id, sex_code=sex, birth_date=bd, age_at_onset_value=av, age_at_onset_ucum=au,
                age_group_reported_code=agr, age_group_derived_code=ad, gestation_weeks=gw, weight_kg=w, height_cm=h,
                last_menstrual_period=r.last_menstrual_period, patient_identifiable=ident)
    return PatientResult(input_sha256=sha(source), patient=p, pregnancy_or_breastfeeding_mentioned=r.patient_is_pregnant_or_breastfeeding_mentioned, flags=f)

class PatientAgent:
    def __init__(self, llm: LLMClient): self.llm = llm
    def run(self, source: str) -> PatientResult:
        return assemble(source, call_structured(self.llm, SYSTEM, source, PatientRead))
