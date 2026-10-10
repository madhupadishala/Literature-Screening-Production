from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Criterion(str, Enum):
    DEATH = "death"
    LIFE_THREATENING = "life_threatening"
    HOSPITALIZATION = "hospitalization"
    DISABILITY = "disability"
    CONGENITAL_ANOMALY = "congenital_anomaly"
    MEDICALLY_IMPORTANT = "medically_important"


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CaseInput(Strict):
    case_id: str = Field(min_length=1, max_length=128)
    narrative: str = Field(max_length=50_000)
    event_terms: list[str] = Field(default_factory=list, max_length=200)  # coded PTs, if available
    reporter_serious: bool | None = None  # reporter's own assessment is never downgraded


class Finding(Strict):
    criterion: Criterion
    status: Literal["present", "absent", "unknown"]
    quote: str | None = None          # verbatim narrative span supporting "present"
    experiencer: Literal["patient", "other", "unclear"] = "patient"


class Extraction(Strict):
    findings: list[Finding]

    @model_validator(mode="after")
    def _one_per_criterion(self):
        if sorted(f.criterion.value for f in self.findings) != sorted(c.value for c in Criterion):
            raise ValueError("exactly one finding per criterion required")
        return self


class CriterionTrace(Strict):
    criterion: Criterion
    llm_state: str
    quote: str | None
    lexical_hits: list[str]
    ime_terms: list[str]
    met: bool


class Decision(Strict):
    case_id: str
    decision: Literal["serious", "non_serious", "needs_review"]
    route: Literal["auto", "hitl"]
    criteria_met: list[Criterion]
    review_reasons: list[str]
    explanation: str                  # built deterministically from the trace, never LLM free text
    trace: list[CriterionTrace]
    versions: dict[str, str]
    input_sha256: str
    audit_id: int | None = None
