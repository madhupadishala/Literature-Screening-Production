from datetime import date
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Factor(str, Enum):
    ALTERNATIVE_CAUSES = "alternative_causes"
    RECHALLENGE = "rechallenge"
    DEFINITIVE_EVENT = "definitive_event"
    PLACEBO_REACTION = "placebo_reaction"
    TOXIC_LEVEL = "toxic_level"
    DOSE_RESPONSE = "dose_response"
    PRIOR_SIMILAR_REACTION = "prior_similar_reaction"
    OBJECTIVE_CONFIRMATION = "objective_confirmation"


CRITICAL = {Factor.ALTERNATIVE_CAUSES}
RECHALLENGE_VALUES = {"positive", "negative", "not_done", "unknown"}
YNU = {"yes", "no", "unknown"}


class Category(str, Enum):
    CERTAIN = "certain"
    PROBABLE = "probable"
    POSSIBLE = "possible"
    UNLIKELY = "unlikely"
    CONDITIONAL = "conditional"      # more data needed
    UNASSESSABLE = "unassessable"    # cannot be judged even after follow-up


# ---------- input
class Drug(Strict):
    name: str = Field(min_length=1, max_length=200)
    role: Literal["suspect", "interacting", "concomitant"] = "suspect"
    start_date: date | None = None
    stop_date: date | None = None
    action_taken: Literal["withdrawn", "dose_reduced", "continued", "unknown"] | None = None
    rechallenge: Literal["positive", "negative", "not_done", "unknown"] | None = None
    dose: str | None = Field(default=None, max_length=120)
    route: str | None = Field(default=None, max_length=80)
    indication: str | None = Field(default=None, max_length=300)
    half_life_hours: float | None = Field(default=None, ge=0)
    expected_latency_min_days: int | None = Field(default=None, ge=0)
    expected_latency_max_days: int | None = Field(default=None, ge=0)
    expected_recovery_min_days: int | None = Field(default=None, ge=0)
    expected_recovery_max_days: int | None = Field(default=None, ge=0)
    dose_response_observed: bool | None = None
    prior_similar_exposure: bool | None = None
    pharmacologic_plausibility: Literal["supported", "unsupported", "unknown"] | None = None
    class_effect_known: bool | None = None

    @model_validator(mode="after")
    def _windows(self):
        if (self.expected_latency_min_days is not None and self.expected_latency_max_days is not None
                and self.expected_latency_min_days > self.expected_latency_max_days):
            raise ValueError("expected latency minimum cannot exceed maximum")
        if (self.expected_recovery_min_days is not None and self.expected_recovery_max_days is not None
                and self.expected_recovery_min_days > self.expected_recovery_max_days):
            raise ValueError("expected recovery minimum cannot exceed maximum")
        return self


class Event(Strict):
    term: str = Field(min_length=1, max_length=200)
    onset_date: date | None = None
    resolution_date: date | None = None
    outcome: Literal["recovered", "recovering", "not_recovered", "fatal", "unknown"] | None = None
    objective_confirmation: bool | None = None
    dechallenge_confounder: bool | None = None
    diagnostic_evidence: list[str] = Field(default_factory=list, max_length=50)
    alternative_etiologies: list[str] = Field(default_factory=list, max_length=50)
    competing_interventions: list[str] = Field(default_factory=list, max_length=50)
    baseline_condition_explains_event: bool | None = None


class ReporterCausality(Strict):
    drug: str
    event: str
    related: bool


class CaseInput(Strict):
    case_id: str = Field(min_length=1, max_length=128)
    narrative: str = Field(max_length=50_000)
    drugs: list[Drug] = Field(max_length=50)
    events: list[Event] = Field(max_length=50)
    reporter_causality: list[ReporterCausality] = Field(default_factory=list)
    jurisdiction: str = "global"
    client_id: str | None = Field(default=None, max_length=128)
    as_of: date | None = None
    follow_up_exhausted: bool = False
    source_type: Literal["spontaneous", "literature", "clinical_trial", "social_media", "other"] = "other"


# ---------- LLM extraction
class FactorValue(Strict):
    factor: Factor
    value: str
    quote: str | None = None

    @model_validator(mode="after")
    def _allowed(self):
        ok = RECHALLENGE_VALUES if self.factor == Factor.RECHALLENGE else YNU
        if self.value not in ok:
            raise ValueError(f"{self.factor.value}: value must be one of {sorted(ok)}")
        return self


class PairExtraction(Strict):
    factors: list[FactorValue]

    @model_validator(mode="after")
    def _one_each(self):
        if sorted(f.factor.value for f in self.factors) != sorted(f.value for f in Factor):
            raise ValueError("exactly one entry per factor required")
        return self


# ---------- output
class Citation(Strict):
    kb: str
    source: str
    section_id: str
    version: str
    quote: str


class FactorResult(Strict):
    value: str
    state: str
    quote: str | None = None


class Timeline(Strict):
    time_to_onset_days: int | None
    temporal: Literal["compatible", "implausible", "after_stop", "unknown"]
    dechallenge: Literal["positive", "negative", "not_applicable", "unknown"]
    data_issues: list[str]


class EvidenceDimension(Strict):
    value: str
    source: Literal["structured", "narrative", "knowledge", "derived", "unknown"]
    confidence: Literal["high", "medium", "low", "unknown"] = "unknown"
    rationale: str | None = None


class AgentStep(Strict):
    agent: str
    status: Literal["ok", "warning", "failed", "skipped"]
    summary: str
    evidence_keys: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class PairAssessment(Strict):
    case_id: str
    drug: str
    event: str
    method: str
    rule_pack_version: str
    category: Category
    method_detail: str
    fired_rules: list[str]
    missing_data: list[str]
    timeline: Timeline
    evidence: dict[str, EvidenceDimension] = Field(default_factory=dict)
    factors: dict[str, FactorResult]
    label_listed: Literal["yes", "unknown"]
    reporter_related: bool | None
    reporter_disagreement: bool
    policy_basis: list[Citation]
    product_evidence: list[Citation]
    regulatory_context: list[Citation]
    route: Literal["auto", "hitl"]
    review_reasons: list[str]
    explanation: str
    orchestration_trace: list[str] = Field(default_factory=list)
    agent_steps: list[AgentStep] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low", "unknown"] = "unknown"
    knowledge_snapshot_id: str | None = None


class CaseAssessment(Strict):
    case_id: str
    pairs: list[PairAssessment]
    route: Literal["auto", "hitl"]
    review_reasons: list[str]
    versions: dict[str, str]
    input_sha256: str
    audit_id: int | None = None
