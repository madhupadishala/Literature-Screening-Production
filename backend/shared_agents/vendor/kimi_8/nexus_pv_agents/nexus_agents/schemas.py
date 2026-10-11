"""TheClinixAI Nexus — shared, versioned data contracts for the eight PV agents.

Contract version: 1.0.0
All inter-agent communication uses these typed models. Facts and inferences are
kept strictly separate (Phase 4.1 evidence-first architecture).
"""
from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

CONTRACT_VERSION = "1.0.0"


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


# ---------------------------------------------------------------- enums
class ResultStatus(str, Enum):
    CONFIRMED = "confirmed"                    # sufficient source evidence
    POSSIBLE = "possible"                      # suspected, not established
    UNRESOLVED = "unresolved"                  # evidence insufficient
    CONFLICTING = "conflicting"                # sources contradict
    MISSING_SOURCE = "missing_source"
    PROCESSING_FAILURE = "processing_failure"
    HUMAN_REVIEW_REQUIRED = "human_review_required"


class Sex(str, Enum):
    MALE = "M"
    FEMALE = "F"
    UNKNOWN = "UNK"


# ------------------------------------------------------------- evidence
class EvidenceSpan(BaseModel):
    """Exact source evidence for one fact or inference."""
    document_id: str
    quote: str
    page: Optional[int] = None
    section: Optional[str] = None
    char_start: Optional[int] = None
    char_end: Optional[int] = None


class Fact(BaseModel):
    """A fact directly grounded in source evidence."""
    field: str
    value: Any
    evidence: list[EvidenceSpan] = Field(default_factory=list)


class Inference(BaseModel):
    """A derived conclusion. Never silently promoted to Fact."""
    field: str
    value: Any
    rationale: str
    supporting_facts: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    applied_knowledge: list[str] = Field(default_factory=list)  # register IDs


class AgentResult(BaseModel):
    """Uniform output envelope for every agent (Phase 4.1 / 4.3)."""
    contract_version: str = CONTRACT_VERSION
    agent: str
    agent_version: str
    status: ResultStatus = ResultStatus.UNRESOLVED
    facts: list[Fact] = Field(default_factory=list)
    inferences: list[Inference] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)  # agent-specific
    uncertainties: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    reviewer_decision: Optional[dict[str, Any]] = None
    regulatory_references: list[str] = Field(default_factory=list)  # register IDs


# ------------------------------------------------------------- documents
class SourceDocument(BaseModel):
    document_id: str = Field(default_factory=lambda: _new_id("DOC"))
    source_type: str = "narrative"      # narrative|literature|e2b|cioms|medwatch
    title: Optional[str] = None
    text: str = ""
    page_map: Optional[list[tuple[int, int]]] = None  # (char_start, page)


class LiteratureArticle(BaseModel):
    record_id: str = Field(default_factory=lambda: _new_id("LIT"))
    source_database: Optional[str] = None
    pmid: Optional[str] = None
    doi: Optional[str] = None
    title: str = ""
    abstract: str = ""
    full_text: Optional[str] = None
    authors: list[str] = Field(default_factory=list)
    journal: Optional[str] = None
    year: Optional[int] = None
    publication_types: list[str] = Field(default_factory=list)  # e.g. "Case Reports", "Review", "Preprint", "Conference Abstract", "Randomized Controlled Trial", "Correction"
    language: str = "en"
    mentions_products: list[str] = Field(default_factory=list)
    mentioned_events: list[str] = Field(default_factory=list)
    described_patients: list[str] = Field(default_factory=list)  # case descriptors, e.g. "54-year-old man"
    patient_count: Optional[int] = None
    has_full_text: bool = False


# ------------------------------------------------------------- ICSR
class DrugExposure(BaseModel):
    drug_id: str = Field(default_factory=lambda: _new_id("DRG"))
    name: str
    verbatim: Optional[str] = None
    role: str = "suspect"               # suspect|concomitant|interacting|not_administered
    dose: Optional[str] = None
    route: Optional[str] = None
    indication: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    batch: Optional[str] = None
    action_taken_raw: Optional[str] = None
    action_taken_e2b: Optional[str] = None   # G.k.8: 1/2/3/4/0/9


class AdverseEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: _new_id("EVT"))
    verbatim: str
    coded_term: Optional[str] = None        # placeholder PT (licensed MedDRA in prod)
    onset_date: Optional[date] = None
    end_date: Optional[date] = None
    outcome_e2b: Optional[str] = None       # E.i.7: 1..5, 0
    serious: Optional[bool] = None
    seriousness_criteria: list[str] = Field(default_factory=list)


class PatientInfo(BaseModel):
    initials: Optional[str] = None
    age_value: Optional[float] = None
    age_unit: str = "years"
    date_of_birth: Optional[date] = None
    sex: Sex = Sex.UNKNOWN
    weight_kg: Optional[float] = None
    identifiable: Optional[bool] = None


class ReporterInfo(BaseModel):
    reporter_id: Optional[str] = None
    qualification: Optional[str] = None     # physician|pharmacist|consumer|lawyer|other
    organization: Optional[str] = None
    country: Optional[str] = None
    identifiable: Optional[bool] = None


class LiteratureCitation(BaseModel):
    pmid: Optional[str] = None
    doi: Optional[str] = None
    title: Optional[str] = None


class ICSR(BaseModel):
    """Individual Case Safety Report (structured intake model)."""
    case_id: str = Field(default_factory=lambda: _new_id("CASE"))
    worldwide_unique_id: Optional[str] = None       # E2B(R3) C.1.8.1
    sender_case_id: Optional[str] = None
    sender_organization: Optional[str] = None
    other_case_identifiers: list[str] = Field(default_factory=list)  # C.1.9.1
    version: int = 1
    receipt_date: Optional[date] = None
    country_of_occurrence: Optional[str] = None
    report_type: str = "spontaneous"     # spontaneous|literature|study|other
    patient: PatientInfo = Field(default_factory=PatientInfo)
    reporters: list[ReporterInfo] = Field(default_factory=list)
    drugs: list[DrugExposure] = Field(default_factory=list)
    events: list[AdverseEvent] = Field(default_factory=list)
    narrative: str = ""
    literature: list[LiteratureCitation] = Field(default_factory=list)
    medical_history_text: str = ""
    followup_to_case_id: Optional[str] = None     # declared follow-up linkage
    source_document_ids: list[str] = Field(default_factory=list)

    # ---- ICH/GVP four minimum criteria
    def missing_minimum_criteria(self) -> list[str]:
        missing = []
        if not any(d.role == "suspect" for d in self.drugs):
            missing.append("suspect_product")
        if not self.events:
            missing.append("adverse_reaction")
        pat = self.patient
        pat_ok = pat.identifiable or bool(pat.initials or pat.age_value or pat.date_of_birth or (pat.sex != Sex.UNKNOWN))
        if not pat_ok:
            missing.append("identifiable_patient")
        rep_ok = any(r.identifiable or bool(r.qualification or r.country or r.organization) for r in self.reporters)
        if not rep_ok:
            missing.append("identifiable_reporter")
        return missing


class DrugEventPair(BaseModel):
    """One assessable drug-event pair (per-pair results are mandatory)."""
    pair_id: str = Field(default_factory=lambda: _new_id("PAIR"))
    drug_id: str
    drug_name: str
    event_id: str
    event_verbatim: str
