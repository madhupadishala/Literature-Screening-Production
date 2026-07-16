"""
hit_models.py
-------------
ClinixAI Hits workflow models.

Scope:
    Defines the final Hits table row produced from reusable intelligence facts.

This model is consumed by:
    - Hits UI
    - Screening workflow
    - Intake workflow
    - QC workflow
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class HitsRow:
    hit_id: str
    tenant_id: str

    pmid: Optional[str]
    doi: Optional[str]
    title: Optional[str]
    journal: Optional[str]
    publication_date: Optional[str]
    publication_year: Optional[str]
    article_type: Optional[str]

    product_id: Optional[str]
    product_name: Optional[str]
    normalized_identity: Optional[str]
    matched_term: Optional[str]
    match_type: Optional[str]
    match_source: Optional[str]
    company_product_status: str
    detected_strength: Optional[str]
    detected_formulation: Optional[str]

    primary_author: Optional[str]
    all_authors: List[str]
    author_country: Optional[str]

    country_of_interest: Optional[str]
    mah_country_status: str
    mah_country_match: bool

    pii_present: bool
    pii_findings: List[Dict[str, Any]]

    confidence_score: float
    qc_required: bool
    qc_flags: List[Dict[str, Any]]

    evidence_sentence: Optional[str]
    ai_summary: Optional[str]

    hits_status: str = "ready_for_screening"
    screening_status: str = "pending"
    intake_status: str = "not_started"
    qc_status: str = "not_started"

    raw_facts: Dict[str, Any] = field(default_factory=dict)