"""Nexus shared agent clinical decision contracts (Step 2).

Standardized schema only. Existing agents are adapted in Step 3.
A model output must not silently become a verified clinical fact.
"""
from __future__ import annotations
from enum import Enum
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ClinicalStatus(str, Enum):
    SUPPORTED = "supported"
    POSSIBLE = "possible"
    UNKNOWN = "unknown"
    CONFLICTING = "conflicting"
    NEGATED = "negated"
    NOT_APPLICABLE = "not_applicable"
    PROCESSING_FAILED = "processing_failed"


class EvidenceReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: str = Field(min_length=1)
    exact_quote: str = Field(min_length=1)
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    locator: str | None = None

    @model_validator(mode="after")
    def nonzero_span(self):
        if self.end <= self.start:
            raise ValueError("Invalid source span")
        return self

    def validate_against(self, source: str) -> None:
        if self.end > len(source) or source[self.start:self.end] != self.exact_quote:
            raise ValueError("Evidence quote must match original source offsets")


class ClinicalFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field: str = Field(min_length=1)
    value: Any = None
    status: ClinicalStatus
    evidence: list[EvidenceReference] = Field(default_factory=list)
    rationale: str = Field(min_length=1)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    knowledge_rule_ids: list[str] = Field(default_factory=list)
    drug_id: str | None = None
    event_id: str | None = None
    patient_id: str | None = None
    reviewer_required: bool = True

    @model_validator(mode="after")
    def clinical_evidence_gate(self):
        if self.status == ClinicalStatus.SUPPORTED and not self.evidence:
            raise ValueError("Supported finding requires source evidence")
        if self.status in (ClinicalStatus.UNKNOWN, ClinicalStatus.CONFLICTING,
                           ClinicalStatus.PROCESSING_FAILED) and not self.reviewer_required:
            raise ValueError("Uncertain/failed findings require review")
        return self


class AgentClinicalResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: str = "nexus.clinical-finding/1"
    agent_id: str = Field(min_length=1)
    tenant_id: str = Field(min_length=1)
    client_id: str = Field(min_length=1)
    case_id: str = Field(min_length=1)
    input_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    findings: list[ClinicalFinding] = Field(default_factory=list)
    missing_inputs: list[str] = Field(default_factory=list)
    processing_issues: list[str] = Field(default_factory=list)
    review_required: bool = True
    autonomous_release: bool = False

    @model_validator(mode="after")
    def no_automatic_release(self):
        if self.autonomous_release or not self.review_required:
            raise ValueError("Clinical source proposals cannot auto-release")
        return self

    def validate_grounding(self, source_text: str) -> None:
        for finding in self.findings:
            for evidence in finding.evidence:
                evidence.validate_against(source_text)
