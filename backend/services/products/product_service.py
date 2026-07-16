"""
product_service.py
------------------
ClinixAI Product Detection Service.

Purpose:
    Detect company product identity and validate explicitly mentioned
    strength and pharmaceutical formulation against the Product Master.

Rules:
    1. Identity match is mandatory.
    2. Strength is checked only when explicitly mentioned.
    3. Formulation is checked only when explicitly mentioned.
    4. Route is never used for company product matching.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from .evidence_extractor import EvidenceExtractor
from .matcher import ProductMatcher
from .strength_detector import StrengthDetector
from .variant_detector import VariantDetector


LOGGER = logging.getLogger(__name__)

RESOLVER_NAME = "ClinixAI.ProductDetectionService"
RESOLVER_VERSION = "3.0.0"


class CompanyMatchStatus(str, Enum):
    COMPANY_PRODUCT = "company_product"
    NON_COMPANY_PRODUCT = "non_company_product"
    QC_REQUIRED = "qc_required"


class AttributeMatchStatus(str, Enum):
    NOT_MENTIONED = "not_mentioned"
    MATCHED = "matched"
    MISMATCHED = "mismatched"
    MASTER_DATA_UNAVAILABLE = "master_data_unavailable"
    AMBIGUOUS = "ambiguous"


class ProductDetectionError(RuntimeError):
    """Raised when product detection cannot execute safely."""


@dataclass(frozen=True)
class AssociatedAttribute:
    value: Optional[str]
    normalized_value: Optional[str]
    character_start: Optional[int]
    character_end: Optional[int]
    ambiguous: bool = False


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

    strength_match_status: str
    formulation_match_status: str
    decision_reason: str

    tenant_id: str
    source_section: Optional[str]

    resolver: str = RESOLVER_NAME
    resolver_version: str = RESOLVER_VERSION


class ProductDetectionService:
    ATTRIBUTE_ASSOCIATION_WINDOW = 100
    _CLAUSE_BOUNDARY_RE = re.compile(r"[;\n]")

    _FORMULATION_ALIASES: Mapping[str, str] = {
        "tablet": "tablet",
        "tablets": "tablet",
        "tab": "tablet",
        "tabs": "tablet",
        "capsule": "capsule",
        "capsules": "capsule",
        "cap": "capsule",
        "caps": "capsule",
        "syrup": "syrup",
        "solution": "solution",
        "suspension": "suspension",
        "oral suspension": "oral suspension",
        "injection": "injection",
        "solution for injection": "solution for injection",
        "infusion": "infusion",
        "solution for infusion": "solution for infusion",
        "cream": "cream",
        "gel": "gel",
        "ointment": "ointment",
        "patch": "patch",
        "transdermal patch": "transdermal patch",
        "powder": "powder",
        "vial": "vial",
        "ampoule": "ampoule",
        "ampule": "ampoule",
        "prefilled syringe": "prefilled syringe",
    }

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
        tenant_id = self._require_text(tenant_id, "tenant_id")

        if not article_text or not article_text.strip():
            return []

        raw_matches = self.matcher.match(article_text)
        if not raw_matches:
            return []

        sentences = self.extractor.split_sentences(article_text)
        sentence_boundaries = [(start, end) for _, start, end in sentences]

        matches = self.matcher.deduplicate_by_sentence(raw_matches, sentence_boundaries)

        facts: List[ProductFact] = []

        for sentence_text, sentence_start, sentence_end in sentences:
            sentence_matches = [
                match for match in matches
                if sentence_start <= self._match_start(match) < sentence_end
            ]

            if not sentence_matches:
                continue

            strengths = self._adjust_offsets(
                self.strength_detector.detect(article_text[sentence_start:sentence_end]),
                sentence_start,
            )

            formulations = self._adjust_offsets(
                self.formulation_detector.detect(article_text[sentence_start:sentence_end]),
                sentence_start,
            )

            for match in sentence_matches:
                strength = self._associate_attribute(
                    article_text=article_text,
                    current_match=match,
                    sentence_matches=sentence_matches,
                    attributes=strengths,
                    value_keys=("normalized_strength", "strength"),
                )

                formulation = self._associate_attribute(
                    article_text=article_text,
                    current_match=match,
                    sentence_matches=sentence_matches,
                    attributes=formulations,
                    value_keys=("formulation", "variant", "dosage_form"),
                )

                facts.append(
                    self._build_product_fact(
                        match=match,
                        tenant_id=tenant_id,
                        source_section=source_section,
                        evidence_sentence=sentence_text,
                        strength=strength,
                        formulation=formulation,
                    )
                )

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

        metadata = self._read_json(metadata_file)
        abstract_text = abstract_file.read_text(encoding="utf-8")

        title = str(metadata.get("title") or "").strip()
        if title and not title.endswith((".", "!", "?")):
            title = f"{title}."

        combined_text = "\n\n".join(part for part in (title, abstract_text.strip()) if part)

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
        match: Any,
        tenant_id: str,
        source_section: Optional[str],
        evidence_sentence: str,
        strength: AssociatedAttribute,
        formulation: AssociatedAttribute,
    ) -> ProductFact:
        product_id = self._string_attr(match, "product_id")
        product_record = self._product_catalog.get(product_id)

        strength_status = self._evaluate_strength(strength, product_record)
        formulation_status = self._evaluate_formulation(formulation, product_record)

        company_status, qc_required, decision_reason = self._resolve_company_match_status(
            product_record=product_record,
            strength_status=strength_status,
            formulation_status=formulation_status,
        )

        matched_term = self._string_attr(match, "matched_term")
        matched_dictionary_value = self._string_attr(
            match,
            "matched_dictionary_value",
            fallback=matched_term,
        )

        base_confidence = self._safe_confidence(
            getattr(match, "base_confidence", 0.95)
        )

        return ProductFact(
            normalized_identity=self._string_attr(
                match,
                "normalized_identity",
                fallback=self._normalize_text(matched_dictionary_value),
            ),
            product_id=product_id,
            product_name=self._string_attr(match, "product_name"),
            inn=self._optional_string_attr(match, "inn"),
            matched_term=matched_term,
            matched_dictionary_value=matched_dictionary_value,
            match_type=self._string_attr(match, "match_type", fallback="unknown"),
            match_source=self._string_attr(match, "match_source", fallback="unknown"),
            base_confidence=base_confidence,
            evidence_sentence=evidence_sentence.strip(),
            character_start=self._match_start(match),
            character_end=self._match_end(match),
            detected_strength=strength.value,
            detected_formulation=formulation.value,
            company_match_status=company_status.value,
            qc_required=qc_required,
            strength_match_status=strength_status.value,
            formulation_match_status=formulation_status.value,
            decision_reason=decision_reason,
            tenant_id=tenant_id,
            source_section=source_section,
        )

    def _evaluate_strength(
        self,
        detected: AssociatedAttribute,
        product_record: Optional[Mapping[str, Any]],
    ) -> AttributeMatchStatus:
        if detected.ambiguous:
            return AttributeMatchStatus.AMBIGUOUS

        if not detected.value:
            return AttributeMatchStatus.NOT_MENTIONED

        if not product_record:
            return AttributeMatchStatus.MASTER_DATA_UNAVAILABLE

        configured = self._extract_configured_values(
            product_record,
            (
                "strength",
                "strengths",
                "manufactured_strength",
                "manufactured_strengths",
                "approved_strength",
                "approved_strengths",
                "product_strength",
                "product_strengths",
            ),
        )

        if not configured:
            return AttributeMatchStatus.MASTER_DATA_UNAVAILABLE

        detected_key = self._canonical_strength(detected.normalized_value or detected.value)
        configured_keys = {self._canonical_strength(value) for value in configured}

        return (
            AttributeMatchStatus.MATCHED
            if detected_key in configured_keys
            else AttributeMatchStatus.MISMATCHED
        )

    def _evaluate_formulation(
        self,
        detected: AssociatedAttribute,
        product_record: Optional[Mapping[str, Any]],
    ) -> AttributeMatchStatus:
        if detected.ambiguous:
            return AttributeMatchStatus.AMBIGUOUS

        if not detected.value:
            return AttributeMatchStatus.NOT_MENTIONED

        if not product_record:
            return AttributeMatchStatus.MASTER_DATA_UNAVAILABLE

        configured = self._extract_configured_values(
            product_record,
            (
                "formulation",
                "formulations",
                "dosage_form",
                "dosage_forms",
                "pharmaceutical_form",
                "pharmaceutical_forms",
                "product_form",
                "product_forms",
            ),
        )

        if not configured:
            return AttributeMatchStatus.MASTER_DATA_UNAVAILABLE

        detected_key = self._canonical_formulation(detected.normalized_value or detected.value)
        configured_keys = {self._canonical_formulation(value) for value in configured}

        return (
            AttributeMatchStatus.MATCHED
            if detected_key in configured_keys
            else AttributeMatchStatus.MISMATCHED
        )

    @staticmethod
    def _resolve_company_match_status(
        product_record: Optional[Mapping[str, Any]],
        strength_status: AttributeMatchStatus,
        formulation_status: AttributeMatchStatus,
    ) -> Tuple[CompanyMatchStatus, bool, str]:
        if not product_record:
            return (
                CompanyMatchStatus.QC_REQUIRED,
                True,
                "Identity matched but Product Master record could not be resolved.",
            )

        if strength_status is AttributeMatchStatus.MISMATCHED:
            return (
                CompanyMatchStatus.NON_COMPANY_PRODUCT,
                False,
                "Identity matched but detected strength is not configured.",
            )

        if formulation_status is AttributeMatchStatus.MISMATCHED:
            return (
                CompanyMatchStatus.NON_COMPANY_PRODUCT,
                False,
                "Identity matched but detected formulation is not configured.",
            )

        if strength_status in {
            AttributeMatchStatus.AMBIGUOUS,
            AttributeMatchStatus.MASTER_DATA_UNAVAILABLE,
        }:
            return (
                CompanyMatchStatus.QC_REQUIRED,
                True,
                "Strength mentioned but could not be safely validated.",
            )

        if formulation_status in {
            AttributeMatchStatus.AMBIGUOUS,
            AttributeMatchStatus.MASTER_DATA_UNAVAILABLE,
        }:
            return (
                CompanyMatchStatus.QC_REQUIRED,
                True,
                "Formulation mentioned but could not be safely validated.",
            )

        return (
            CompanyMatchStatus.COMPANY_PRODUCT,
            False,
            "Identity matched and applicable product attributes validated.",
        )

    def _associate_attribute(
        self,
        article_text: str,
        current_match: Any,
        sentence_matches: Sequence[Any],
        attributes: Sequence[Mapping[str, Any]],
        value_keys: Sequence[str],
    ) -> AssociatedAttribute:
        if not attributes:
            return AssociatedAttribute(None, None, None, None, False)

        current_start = self._match_start(current_match)
        current_end = self._match_end(current_match)

        candidates: List[Tuple[int, Mapping[str, Any], bool]] = []

        for attribute in attributes:
            attr_start = int(attribute.get("character_start", -1))
            attr_end = int(attribute.get("character_end", -1))

            if attr_start < 0 or attr_end < attr_start:
                continue

            current_distance = self._span_distance(current_start, current_end, attr_start, attr_end)
            if current_distance > self.ATTRIBUTE_ASSOCIATION_WINDOW:
                continue

            between = self._text_between_spans(
                article_text,
                current_start,
                current_end,
                attr_start,
                attr_end,
            )

            if self._CLAUSE_BOUNDARY_RE.search(between):
                continue

            distances = [
                (
                    self._span_distance(
                        self._match_start(product_match),
                        self._match_end(product_match),
                        attr_start,
                        attr_end,
                    ),
                    product_match,
                )
                for product_match in sentence_matches
            ]

            min_distance = min(distance for distance, _ in distances)
            nearest = [product_match for distance, product_match in distances if distance == min_distance]

            if current_match not in nearest:
                continue

            candidates.append((current_distance, attribute, len(nearest) > 1))

        if not candidates:
            return AssociatedAttribute(None, None, None, None, False)

        candidates.sort(key=lambda item: item[0])

        if len([item for item in candidates if item[0] == candidates[0][0]]) > 1 or candidates[0][2]:
            return AssociatedAttribute(None, None, None, None, True)

        _, selected, _ = candidates[0]

        value = self._first_value(selected, value_keys)
        normalized = self._first_value(
            selected,
            ("normalized_strength", "normalized_formulation", "formulation", "variant", "strength"),
        )

        if not value:
            return AssociatedAttribute(None, None, None, None, True)

        return AssociatedAttribute(
            value=value,
            normalized_value=normalized or value,
            character_start=int(selected["character_start"]),
            character_end=int(selected["character_end"]),
            ambiguous=False,
        )

    @staticmethod
    def _load_product_catalog(path: Path) -> Dict[str, Dict[str, Any]]:
        payload = ProductDetectionService._read_json(path)

        products = payload.get("products", payload) if isinstance(payload, dict) else payload

        if not isinstance(products, list):
            raise ProductDetectionError("Product Master must be a list or {'products': [...]}.")

        catalog: Dict[str, Dict[str, Any]] = {}

        for product in products:
            if not isinstance(product, dict):
                continue

            product_id = str(product.get("product_id") or product.get("id") or "").strip()
            if product_id:
                catalog[product_id] = dict(product)

        return catalog

    @staticmethod
    def _read_json(path: Path) -> Any:
        try:
            with path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except OSError as exc:
            raise ProductDetectionError(f"Could not read JSON file: {path}") from exc
        except json.JSONDecodeError as exc:
            raise ProductDetectionError(f"Invalid JSON file: {path}") from exc

    @staticmethod
    def _extract_configured_values(
        product_record: Mapping[str, Any],
        keys: Sequence[str],
    ) -> List[str]:
        values: List[str] = []

        for key in keys:
            raw = product_record.get(key)

            if raw is None:
                continue

            if isinstance(raw, str):
                values.extend(item.strip() for item in re.split(r"[;,|]", raw) if item.strip())
                continue

            if isinstance(raw, Iterable) and not isinstance(raw, (str, bytes)):
                values.extend(str(item).strip() for item in raw if item is not None and str(item).strip())

        output: List[str] = []
        seen = set()

        for value in values:
            key = value.lower()
            if key not in seen:
                seen.add(key)
                output.append(value)

        return output

    @classmethod
    def _canonical_formulation(cls, value: str) -> str:
        normalized = cls._normalize_text(value)
        return cls._FORMULATION_ALIASES.get(normalized, normalized)

    @classmethod
    def _canonical_strength(cls, value: str) -> str:
        normalized = (
            str(value)
            .strip()
            .lower()
            .replace("μg", "mcg")
            .replace("µg", "mcg")
            .replace("micrograms", "mcg")
            .replace("microgram", "mcg")
            .replace(" ", "")
        )

        normalized = re.sub(r"(?<=\d)-(?=[a-z%])", "", normalized)

        match = re.fullmatch(
            r"(?P<value>\d+(?:\.\d+)?)(?P<unit>mcg|mg|g)(?P<denominator>/[a-z]+(?:/[a-z]+)?)?",
            normalized,
        )

        if not match:
            return normalized

        try:
            numeric_value = Decimal(match.group("value"))
        except InvalidOperation:
            return normalized

        unit = match.group("unit")
        denominator = match.group("denominator") or ""

        if unit == "g":
            numeric_value *= Decimal("1000")
        elif unit == "mcg":
            numeric_value /= Decimal("1000")

        value_text = format(numeric_value.normalize(), "f")
        if "." in value_text:
            value_text = value_text.rstrip("0").rstrip(".")

        return f"{value_text}mg{denominator}"

    @staticmethod
    def _adjust_offsets(
        items: Iterable[Mapping[str, Any]],
        offset: int,
    ) -> List[Dict[str, Any]]:
        adjusted: List[Dict[str, Any]] = []

        for item in items or []:
            copied = dict(item)
            if "character_start" in copied:
                copied["character_start"] = int(copied["character_start"]) + offset
            if "character_end" in copied:
                copied["character_end"] = int(copied["character_end"]) + offset
            adjusted.append(copied)

        return adjusted

    @staticmethod
    def _first_value(item: Mapping[str, Any], keys: Sequence[str]) -> Optional[str]:
        for key in keys:
            value = item.get(key)
            if value is not None and str(value).strip():
                return str(value).strip()
        return None

    @staticmethod
    def _span_distance(first_start: int, first_end: int, second_start: int, second_end: int) -> int:
        if first_end <= second_start:
            return second_start - first_end
        if second_end <= first_start:
            return first_start - second_end
        return 0

    @staticmethod
    def _text_between_spans(
        text: str,
        first_start: int,
        first_end: int,
        second_start: int,
        second_end: int,
    ) -> str:
        if first_end <= second_start:
            return text[first_end:second_start]
        if second_end <= first_start:
            return text[second_end:first_start]
        return ""

    @staticmethod
    def _match_start(match: Any) -> int:
        return int(getattr(match, "character_start"))

    @staticmethod
    def _match_end(match: Any) -> int:
        return int(getattr(match, "character_end"))

    @staticmethod
    def _safe_confidence(value: Any) -> float:
        try:
            confidence = float(value)
        except (TypeError, ValueError):
            return 0.0

        if confidence > 1 and confidence <= 100:
            confidence = confidence / 100

        return min(max(confidence, 0.0), 1.0)

    @staticmethod
    def _string_attr(obj: Any, attribute: str, fallback: str = "") -> str:
        value = getattr(obj, attribute, fallback)
        if value is None:
            return fallback
        text = str(value).strip()
        return text or fallback

    @staticmethod
    def _optional_string_attr(obj: Any, attribute: str) -> Optional[str]:
        value = getattr(obj, attribute, None)
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @staticmethod
    def _normalize_text(value: str) -> str:
        normalized = str(value).strip().lower().replace("-", " ")
        normalized = re.sub(r"\s+", " ", normalized)
        return normalized

    @staticmethod
    def _require_text(value: str, field_name: str) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ProductDetectionError(f"{field_name} is required.")
        return cleaned


def main() -> int:
    parser = argparse.ArgumentParser(description="ClinixAI Product Detection Service")
    parser.add_argument("--product-master", required=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--abstract", required=True)
    parser.add_argument("--tenant-id", required=True)

    args = parser.parse_args()

    service = ProductDetectionService(args.product_master)
    facts = service.detect_from_files(
        metadata_path=args.metadata,
        abstract_path=args.abstract,
        tenant_id=args.tenant_id,
    )

    print(json.dumps(service.to_dict_list(facts), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())