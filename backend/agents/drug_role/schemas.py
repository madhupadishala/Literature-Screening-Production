from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Dict, List, Optional


class DrugRole(str, Enum):
    SUSPECT = "SUSPECT"
    CONCOMITANT = "CONCOMITANT"
    HISTORICAL = "HISTORICAL"
    TREATMENT = "TREATMENT"
    UNKNOWN = "UNKNOWN"


class Ownership(str, Enum):
    COMPANY = "COMPANY"
    NON_COMPANY = "NON_COMPANY"
    UNKNOWN = "UNKNOWN"


@dataclass
class EvidenceSpan:
    text: str
    start: int
    end: int
    evidence_type: str
    weight: float = 0.0


@dataclass
class DrugMention:
    reported_name: str
    normalized_name: str
    start: int
    end: int
    context: str
    evidence: List[EvidenceSpan] = field(default_factory=list)


@dataclass
class DrugClassification:
    reported_name: str
    normalized_name: str
    role: DrugRole
    ownership: Ownership
    confidence: float
    rationale: str
    evidence: List[EvidenceSpan] = field(default_factory=list)
    product_master_match: Optional[Dict[str, Any]] = None
    requires_human_review: bool = False


@dataclass
class DrugRoleResult:
    case_id: str
    tenant_id: str
    source_type: str
    classifications: List[DrugClassification]
    review_required: bool
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        for item in payload["classifications"]:
            item["role"] = item["role"].value if hasattr(item["role"], "value") else item["role"]
            item["ownership"] = item["ownership"].value if hasattr(item["ownership"], "value") else item["ownership"]
        return payload
