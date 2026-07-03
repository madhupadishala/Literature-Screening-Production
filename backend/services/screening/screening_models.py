from dataclasses import dataclass, field
from typing import List


@dataclass
class ScreeningRow:
    tenant_id: str
    pmid: str

    screening_status: str
    intake_status: str

    company_suspect_drugs: List[str]
    active_mah: str
    co_suspect_drugs: List[str]
    concomitant_medications: List[str]
    treatment_medications: List[str]

    clinical_events: List[str]
    special_situations: List[str]
    event_severity: str
    seriousness: str
    patient_safety: str
    patient_identification_pii: str
    coi: str

    screening_decision: str
    screening_reasoning: str

    generated_at: str
    exclusion_terms_detected: List[str] = field(default_factory=list)
    flags: List[str] = field(default_factory=list)