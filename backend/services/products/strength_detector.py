"""
strength_detector.py
--------------------
ClinixAI Strength Detector.

Scope:
    Detect strength expressions in medical/literature text.

This module DOES NOT decide:
    - company product match
    - suspect product
    - treatment/concomitant role
    - causality
    - route
    - formulation

Those decisions belong to Product Service / Screening / Intake engines.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional, Pattern, Sequence, Tuple


STRENGTH_PATTERNS: Sequence[Tuple[str, str]] = (
    (
        "weight_based_daily",
        r"\b(?P<value>\d+(?:\.\d+)?)\s*(?:-)?\s*(?P<unit>mg|g|mcg|µg|μg|microgram|micrograms|iu|units?)\s*/\s*kg\s*/\s*(?:day|daily|d)\b",
    ),
    (
        "weight_based",
        r"\b(?P<value>\d+(?:\.\d+)?)\s*(?:-)?\s*(?P<unit>mg|g|mcg|µg|μg|microgram|micrograms|iu|units?)\s*/\s*kg\b",
    ),
    (
        "concentration",
        r"\b(?P<value>\d+(?:\.\d+)?)\s*(?:-)?\s*(?P<unit>mg|g|mcg|µg|μg|microgram|micrograms|iu|units?|mmol|mol)\s*/\s*(?P<denominator>ml|mL|l|L|g)\b",
    ),
    (
        "concentration_per",
        r"\b(?P<value>\d+(?:\.\d+)?)\s*(?:-)?\s*(?P<unit>mg|g|mcg|µg|μg|microgram|micrograms|iu|units?|mmol|mol)\s+per\s+(?P<denominator>ml|mL|l|L|g|kg)\b",
    ),
    (
        "percentage",
        r"\b(?P<value>\d+(?:\.\d+)?)\s*%\b",
    ),
    (
        "simple_strength",
        r"\b(?P<value>\d+(?:\.\d+)?)\s*(?:-)?\s*(?P<unit>mg|g|mcg|µg|μg|microgram|micrograms|iu|units?|mmol|mol|meq|mEq)\b",
    ),
)


UNIT_NORMALIZATION: Dict[str, str] = {
    "mg": "mg",
    "g": "g",
    "mcg": "mcg",
    "µg": "mcg",
    "μg": "mcg",
    "microgram": "mcg",
    "micrograms": "mcg",
    "iu": "IU",
    "unit": "units",
    "units": "units",
    "mmol": "mmol",
    "mol": "mol",
    "meq": "mEq",
    "mEq": "mEq",
}


DENOMINATOR_NORMALIZATION: Dict[str, str] = {
    "ml": "mL",
    "mL": "mL",
    "l": "L",
    "L": "L",
    "g": "g",
    "kg": "kg",
}


@dataclass(frozen=True)
class StrengthMention:
    strength: str
    normalized_strength: str
    value: str
    unit: str
    strength_type: str
    matched_text: str
    character_start: int
    character_end: int
    confidence: float


class StrengthDetector:
    """
    Detects strength expressions.

    Examples:
        500 mg
        650mg
        500-mg
        12.5 mg
        10 mg/mL
        100 units/mL
        5%
        150 mg/kg
        5 mg/kg/day
    """

    _compiled_patterns: Sequence[Tuple[str, Pattern[str]]] = tuple(
        (name, re.compile(pattern, flags=re.IGNORECASE))
        for name, pattern in STRENGTH_PATTERNS
    )

    def detect(self, text: str) -> List[Dict[str, object]]:
        if not text or not text.strip():
            return []

        mentions: List[StrengthMention] = []
        occupied_spans: List[Tuple[int, int]] = []

        for strength_type, regex in self._compiled_patterns:
            for match in regex.finditer(text):
                span = (match.start(), match.end())

                if self._overlaps_existing(span, occupied_spans):
                    continue

                mention = self._build_mention(
                    match=match,
                    strength_type=strength_type,
                )

                if mention is None:
                    continue

                occupied_spans.append(span)
                mentions.append(mention)

        mentions.sort(key=lambda item: (item.character_start, item.character_end))
        return [asdict(item) for item in mentions]

    def detect_nearby(
        self,
        text: str,
        center: int,
        window: int = 120,
    ) -> List[Dict[str, object]]:
        if not text or not text.strip():
            return []

        if center < 0:
            raise ValueError("center must be greater than or equal to 0")

        if window <= 0:
            raise ValueError("window must be greater than 0")

        start = max(0, center - window)
        end = min(len(text), center + window)

        snippet = text[start:end]
        matches = self.detect(snippet)

        for match in matches:
            match["character_start"] = int(match["character_start"]) + start
            match["character_end"] = int(match["character_end"]) + start

        return matches

    def _build_mention(
        self,
        match: re.Match[str],
        strength_type: str,
    ) -> Optional[StrengthMention]:
        groups = match.groupdict()
        raw_value = groups.get("value")

        if raw_value is None:
            return None

        normalized_value = self._normalize_decimal(raw_value)
        if normalized_value is None:
            return None

        raw_unit = groups.get("unit")
        denominator = groups.get("denominator")

        if strength_type == "percentage":
            normalized_strength = f"{normalized_value}%"
            unit = "%"
        else:
            if raw_unit is None:
                return None

            unit = self._normalize_unit(raw_unit)

            if strength_type == "weight_based_daily":
                normalized_strength = f"{normalized_value} {unit}/kg/day"
                unit = f"{unit}/kg/day"

            elif strength_type == "weight_based":
                normalized_strength = f"{normalized_value} {unit}/kg"
                unit = f"{unit}/kg"

            elif strength_type in {"concentration", "concentration_per"}:
                if denominator is None:
                    return None

                normalized_denominator = self._normalize_denominator(denominator)
                normalized_strength = f"{normalized_value} {unit}/{normalized_denominator}"
                unit = f"{unit}/{normalized_denominator}"

            else:
                normalized_strength = f"{normalized_value} {unit}"

        return StrengthMention(
            strength=match.group(0).strip(),
            normalized_strength=normalized_strength,
            value=normalized_value,
            unit=unit,
            strength_type=strength_type,
            matched_text=match.group(0),
            character_start=match.start(),
            character_end=match.end(),
            confidence=1.0,
        )

    @staticmethod
    def _normalize_unit(unit: str) -> str:
        cleaned = unit.strip()
        return UNIT_NORMALIZATION.get(cleaned, UNIT_NORMALIZATION.get(cleaned.lower(), cleaned))

    @staticmethod
    def _normalize_denominator(denominator: str) -> str:
        cleaned = denominator.strip()
        return DENOMINATOR_NORMALIZATION.get(
            cleaned,
            DENOMINATOR_NORMALIZATION.get(cleaned.lower(), cleaned),
        )

    @staticmethod
    def _normalize_decimal(value: str) -> Optional[str]:
        try:
            decimal_value = Decimal(value)
        except InvalidOperation:
            return None

        normalized = format(decimal_value.normalize(), "f")

        if "." in normalized:
            normalized = normalized.rstrip("0").rstrip(".")

        return normalized

    @staticmethod
    def _overlaps_existing(
        candidate: Tuple[int, int],
        existing_spans: Sequence[Tuple[int, int]],
    ) -> bool:
        candidate_start, candidate_end = candidate

        for existing_start, existing_end in existing_spans:
            if candidate_start < existing_end and candidate_end > existing_start:
                return True

        return False


if __name__ == "__main__":
    sample = (
        "The article mentioned paracetamol 500 mg, acetaminophen 650mg, "
        "morphine 10 mg/mL, insulin 100 units/mL, vitamin D 5000 IU, "
        "methotrexate 12.5-mg weekly, hydrocortisone 5%, "
        "and acetylcysteine 150 mg/kg/day."
    )

    detector = StrengthDetector()
    print(detector.detect(sample))