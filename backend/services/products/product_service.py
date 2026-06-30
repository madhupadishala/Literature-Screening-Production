"""
product_service.py
------------------
ClinixAI Product Detection Service.

Scope:
    Detect company product identity only.

This service DOES NOT determine:
    - suspect product role
    - treatment medication
    - concomitant medication
    - medical history medication
    - causality
    - administration route matching

Locked rule:
    Route is NEVER used for company product identity matching.

Product identity matching hierarchy:
    Level 1: Product identity match is mandatory.
    Level 2: If strength is mentioned, compare with Product Master.
    Level 3: If pharmaceutical formulation is mentioned, compare with Product Master.
    Level 4: If Product Master is incomplete, flag QC rather than falsely reject.

Designed for reuse by:
    - Hits Engine
    - Screening
    - Intake
    - QC
"""

from __future__ import annotations

import argparse
import json
import logging
import re
from dataclasses import asdict, dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from .evidence_extractor import EvidenceExtractor
from .matcher import ProductMatcher
from .strength_detector import StrengthDetector
from .variant_detector import VariantDetector


LOGGER = logging.getLogger(__name__)

RESOLVER_NAME = "ClinixAI.ProductDetectionService"
RESOLVER_VERSION = "2.1.0"


class CompanyMatchStatus(str, Enum):
    COMPANY_PRODUCT = "company_product"
    NOT_COMPANY_PRODUCT = "not_company_product"
    STRENGTH_MISMATCH = "strength_mismatch"
    FORMULATION_MISMATCH = "formulation_mismatch"
    QC_REQUIRED = "qc_required"


@dataclass(frozen=True)
class ProductFact:
    normalized_identity: str
    product_id: str
    product_name: str
    inn: Optional[str]

    matched_term: str
    matched_dictionary_value: str
    match_type: str
    match_source: str
    base_confidence: float

    evidence_sentence: str
    character_start: int
    character_end: int

    detected_strength: Optional[str]
    detected_formulation: Optional[str]

    company_match_status: str
    qc_required: bool

    tenant_id: str
    source_section: Optional[str]
    resolver: str = RESOLVER_NAME
    resolver_version: str = RESOLVER_VERSION


class ProductDetectionError(RuntimeError):
    """Raised when Product Detection Service cannot safely execute."""


class ProductDetectionService:
    """
    Production Product Detection Service.

    Responsibilities:
        - Accept article / canonical article text.
        - Detect product identity mentions.
        - Preserve evidence sentence and character offsets.
        - Detect nearby strength and formulation.
        - Validate detected strength/formulation against Product Master if configured.
        - Flag QC when Product Master is incomplete.

    Non-responsibilities:
        - Route-based matching.
        - Suspect/concomitant/treatment classification.
        - Causality.
        - Medical assessment.
    """

    def __init__(
        self,
        product_master_path: Optional[str | Path] = None,
        matcher: Optional[ProductMatcher] = None,
        evidence_extractor: Optional[EvidenceExtractor] = None,
        strength_detector: Optional[StrengthDetector] = None,
        formulation_detector: Optional[VariantDetector] = None,
    ) -> None:
        self.matcher = matcher or ProductMatcher()
        self.extractor = evidence_extractor or EvidenceExtractor()
        self.strength_detector = strength_detector or StrengthDetector()
        self.formulation_detector = formulation_detector or VariantDetector()

        self._product_master_path: Optional[Path] = None
        self._product_catalog: Dict[str, Dict[str, Any]] = {}

        if product_master_path is not None:
            self.load_product_master(product_master_path)

    def load_product_master(self, path: str | Path) -> None:
        master_path = Path(path).expanduser().resolve()

        if not master_path.exists():
            raise ProductDetectionError(f"Product Master not found: {master_path}")

        if not master_path.is_file():
            raise ProductDetectionError(f"Product Master path is not a file: {master_path}")

        self.matcher.load(str(master_path))
        self._product_master_path = master_path
        self._product_catalog = self._load_product_catalog(master_path)

    def detect(
        self,
        article_text: str,
        tenant_id: str,
        source_section: Optional[str] = None,
    ) -> List[ProductFact]:
        if not tenant_id or not tenant_id.strip():
            raise ProductDetectionError("tenant_id is required for audit traceability.")

        if not article_text or not article_text.strip():
            return []

        raw_matches = self.matcher.match(article_text)

        if not raw_matches:
            return []

        sentences = self.extractor.split_sentences(article_text)
        sentence_boundaries = [(start, end) for _, start, end in sentences]

        deduped_matches = self.matcher.deduplicate_by_sentence(
            raw_matches,
            sentence_boundaries,
        )

        facts = [
            self._build_product_fact(
                article_text=article_text,
                match=match,
                tenant_id=tenant_id.strip(),
                source_section=source_section,
            )
            for match in deduped_matches
        ]

        facts.sort(key=lambda item: (item.character_start, item.character_end, item.product_id))
        return facts

    def detect_from_files(
        self,
        metadata_path: str | Path,
        abstract_path: str | Path,
        tenant_id: str,
    ) -> List[ProductFact]:
        metadata_file = Path(metadata_path).expanduser().resolve()
        abstract_file = Path(abstract_path).expanduser().resolve()

        if not metadata_file.exists():
            raise ProductDetectionError(f"Metadata file not found: {metadata_file}")

        if not abstract_file.exists():
            raise ProductDetectionError(f"Abstract file not found: {abstract_file}")

        metadata = self._read_json(metadata_file)
        abstract_text = abstract_file.read_text(encoding="utf-8")

        title = str(metadata.get("title") or "").strip()
        if title and not title.endswith((".", "!", "?")):
            title = f"{title}."

        combined_text = f"{title}\n\n{abstract_text}".strip()

        return self.detect(
            article_text=combined_text,
            tenant_id=tenant_id,
            source_section="Abstract",
        )

    @staticmethod
    def to_dict_list(facts: Sequence[ProductFact]) -> List[Dict[str, Any]]:
        return [asdict(fact) for fact in facts]

    def _build_product_fact(
        self,
        article_text: str,
        match: Any,
        tenant_id: str,
        source_section: Optional[str],
    ) -> ProductFact:
        character_start = int(getattr(match, "character_start"))
        character_end = int(getattr(match, "character_end"))

        sentence_info = self.extractor.find_sentence_for_span(
            article_text,
            character_start,
            character_end,
        )

        if sentence_info:
            evidence_sentence, sentence_start, sentence_end = sentence_info
        else:
            evidence_sentence = article_text[character_start:character_end]
            sentence_start = character_start
            sentence_end = character_end

        sentence_text = article_text[sentence_start:sentence_end]

        detected_strength = self._detect_closest_strength(
            sentence_text=sentence_text,
            sentence_start=sentence_start,
            match_start=character_start,
            match_end=character_end,
        )

        detected_formulation = self._detect_closest_formulation(
            sentence_text=sentence_text,
            sentence_start=sentence_start,
            match_start=character_start,
            match_end=character_end,
        )

        product_id = self._string_attr(match, "product_id")
        product_record = self._product_catalog.get(product_id, {})

        company_match_status, qc_required = self._resolve_company_match_status(
            product_record=product_record,
            detected_strength=detected_strength,
            detected_formulation=detected_formulation,
        )

        matched_term = self._string_attr(match, "matched_term")
        matched_dictionary_value = self._string_attr(
            match,
            "matched_dictionary_value",
            fallback=matched_term,
        )

        normalized_identity = self._string_attr(
            match,
            "normalized_identity",
            fallback=self._normalize_identity(matched_dictionary_value),
        )

        base_confidence = float(getattr(match, "base_confidence", 0.95))
