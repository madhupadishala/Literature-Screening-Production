"""Terminology service interface.

IMPORTANT (REQ-MEDDRA-29.0): MedDRA is licence-restricted. This module ships a
small DEVELOPMENT PLACEHOLDER lexicon (plain-language labels, not MedDRA terms)
so the pipeline is executable. Production deployments must inject a licensed
MedDRA coding service; unmapped verbatims are flagged UNCODED rather than
invented.
"""
from __future__ import annotations

from typing import Optional

# development placeholder only — NOT MedDRA content
_PLACEHOLDER_LEXICON = {
    "anaphylaxis": "PLACEHOLDER:Anaphylaxis",
    "rash": "PLACEHOLDER:Rash",
    "nausea": "PLACEHOLDER:Nausea",
    "vomiting": "PLACEHOLDER:Vomiting",
    "hepatitis": "PLACEHOLDER:Hepatitis",
    "liver injury": "PLACEHOLDER:Liver injury",
    "acute kidney injury": "PLACEHOLDER:Acute kidney injury",
    "renal failure": "PLACEHOLDER:Renal failure",
    "hypertension": "PLACEHOLDER:Hypertension",
    "diabetes": "PLACEHOLDER:Diabetes mellitus",
    "diabetes mellitus": "PLACEHOLDER:Diabetes mellitus",
    "asthma": "PLACEHOLDER:Asthma",
    "atrial fibrillation": "PLACEHOLDER:Atrial fibrillation",
    "coronary artery disease": "PLACEHOLDER:Coronary artery disease",
    "copd": "PLACEHOLDER:COPD",
    "epilepsy": "PLACEHOLDER:Epilepsy",
    "depression": "PLACEHOLDER:Depression",
    "hypothyroidism": "PLACEHOLDER:Hypothyroidism",
    "chronic kidney disease": "PLACEHOLDER:Chronic kidney disease",
    "myocardial infarction": "PLACEHOLDER:Myocardial infarction",
    "stroke": "PLACEHOLDER:Stroke",
    "hyperlipidaemia": "PLACEHOLDER:Hyperlipidaemia",
    "hyperlipidemia": "PLACEHOLDER:Hyperlipidaemia",
    "osteoporosis": "PLACEHOLDER:Osteoporosis",
    "gastrointestinal bleeding": "PLACEHOLDER:Gastrointestinal bleeding",
    "thrombocytopenia": "PLACEHOLDER:Thrombocytopenia",
    "stevens-johnson": "PLACEHOLDER:Stevens-Johnson syndrome",
    "penicillin": "PLACEHOLDER:Penicillin allergy",
    "sulfa": "PLACEHOLDER:Sulfonamide allergy",
}


class TerminologyService:
    """Interface point for licensed MedDRA coding."""

    def __init__(self, licensed_service=None):
        self._licensed = licensed_service  # inject licensed MedDRA service in prod

    def code(self, verbatim: str) -> Optional[str]:
        if self._licensed is not None:
            return self._licensed.code(verbatim)
        v = verbatim.strip().lower()
        for key, label in _PLACEHOLDER_LEXICON.items():
            if key in v:
                return label
        return None  # UNCODED
