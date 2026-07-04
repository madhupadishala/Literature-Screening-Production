from dataclasses import dataclass, field
from typing import List


@dataclass
class IntakeInputPackage:
    tenant_id: str
    source_type: str
    pmid: str
    title: str
    journal: str
    publication_date: str
    country: str

    company_suspect_drugs: List[str]
    clinical_events: List[str]
    special_situations: List[str]

    patient_safety: str
    patient_identification_pii: str
    coi: str
    active_mah: str

    screening_decision: str
    evidence_sentence: str
    screening_flags: List[str] = field(default_factory=list)