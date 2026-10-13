from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class Block(StrictModel):
    id: str
    document_id: str
    locator: str
    text: str
    ingestion_metadata: dict = Field(default_factory=dict)

class Document(StrictModel):
    id: str = Field(min_length=1, max_length=128)
    media_type: Literal["text/plain", "application/xml", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    content_base64: str = Field(max_length=14_000_000)
    language: str = Field(default="und", max_length=32)
    source_type: Literal["spontaneous", "literature", "clinical_trial", "regulatory", "partner", "organised_collection", "digital", "unknown"] = "unknown"

class Request(StrictModel):
    case_id: str = Field(min_length=1, max_length=128)
    documents: list[Document] = Field(min_length=1, max_length=20)
    @model_validator(mode="after")
    def unique_ids(self):
        if len({d.id for d in self.documents}) != len(self.documents):
            raise ValueError("document IDs must be unique")
        return self

class Mention(StrictModel):
    block_id: str
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    verbatim: str = Field(min_length=1)
    patient_id: str | None
    patient_evidence: str | None
    assertion: Literal["affirmed", "negated", "uncertain", "historical", "hypothetical"]
    role: Literal["event", "indication", "medical_history", "special_situation", "outcome", "aggregate", "unknown"]
    diagnosis_status: Literal["reported_diagnosis", "provisional_diagnosis", "symptom_sign", "lab_finding", "other"]
    context_quote: str = Field(min_length=1)
    rationale: str = Field(min_length=1)
    onset_quote: str | None
    outcome_quote: str | None
    # Extract evidence first. No generated dates, invented diagnoses, or invented codes.

class Extraction(StrictModel):
    mentions: list[Mention]
    unresolved: list[str]

class Finding(StrictModel):
    mention_index: int = Field(ge=0)
    disposition: Literal["supported", "reject", "review"]
    reason: str

class Verification(StrictModel):
    findings: list[Finding]
    missed_evidence: list[str]

class Evidence(StrictModel):
    document_id: str
    block_id: str
    locator: str
    start: int
    end: int
    quote: str
    context_quote: str

class Event(StrictModel):
    id: str
    patient_id: str
    verbatim: str
    assertion: str
    diagnosis_status: str
    role: str
    evidence: list[Evidence]
    onset_quote: str | None = None
    outcome_quote: str | None = None
    coding: dict | None = None
    review_required: bool = True

class Result(StrictModel):
    run_id: str
    case_id: str
    status: Literal["review_required", "incomplete"]
    events: list[Event]
    observations: list[dict]
    structured_records: list[dict] = Field(default_factory=list)
    issues: list[str]
    coverage: dict
    provenance: dict
    qualified_for_autonomous_use: bool = False
