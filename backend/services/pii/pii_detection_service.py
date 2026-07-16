"""
pii_detection_service.py
------------------------
ClinixAI PII Detection Service.

Scope:
    Detect possible patient identifiers in literature text.

Reusable by:
    - Hits
    - Screening
    - Intake
    - QC

Important:
    This service detects PII signals only.
    It does not determine case validity or reportability.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Dict, List, Pattern, Sequence, Tuple


PII_PATTERNS: Sequence[Tuple[str, str, float]] = (
    (
        "age",
        r"\b(?:aged|age|a)\s+(?:of\s+)?(?P<value>\d{1,3})\s*(?:years?|yrs?|year-old|yo)?\b",
        0.85,
    ),
    (
        "age_year_old",
        r"\b(?P<value>\d{1,3})[-\s]?year[-\s]?old\b",
        0.90,
    ),
    (
        "sex_male",
        r"\b(?:male|man|boy|gentleman|he|his|him)\b",
        0.75,
    ),
    (
        "sex_female",
        r"\b(?:female|woman|girl|lady|she|her)\b",
        0.75,
    ),
    (
        "initials",
        r"\b(?:patient\s+)?(?:initials?|identified\s+as)\s*[:\-]?\s*(?P<value>[A-Z]{1,3}(?:\.[A-Z])?\.?)\b",
        0.80,
    ),
    (
        "date_of_birth",
        r"\b(?:date\s+of\s+birth|dob|born\s+on)\s*[:\-]?\s*(?P<value>\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b",
        0.95,
    ),
    (
        "partial_birth_year",
        r"\bborn\s+in\s+(?P<value>19\d{2}|20\d{2})\b",
        0.75,
    ),
    (
        "hospital_number",
        r"\b(?:hospital|medical|patient|case)\s*(?:number|no\.?|id)\s*[:\-]?\s*(?P<value>[A-Z0-9\-]{4,})\b",
        0.90,
    ),
    (
        "email",
        r"\b(?P<value>[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})\b",
        0.98,
    ),
    (
        "phone",
        r"\b(?P<value>(?:\+?\d{1,3}[\s\-]?)?(?:\(?\d{2,5}\)?[\s\-]?)?\d{6,10})\b",
        0.70,
    ),
    (
        "postal_address_signal",
        r"\b(?:address|residing\s+at|resident\s+of|lives\s+at)\b.{0,80}",
        0.70,
    ),
    (
        "pregnancy_patient",
        r"\b(?:pregnant\s+(?:woman|patient|female)|pregnancy|foetus|fetus|neonate|newborn)\b",
        0.75,
    ),
)


@dataclass(frozen=True)
class PiiFact:
    pii_type: str
    value: str
    evidence: str
    character_start: int
    character_end: int
    confidence: float
    qc_required: bool


class PiiDetectionService:
    """
    Detects patient-identifying signals from article text.

    Notes:
        Literature rarely contains direct identifiers, but PV screening must
        identify whether patient-level identifiers or partial identifiers are
        present for downstream validity and intake review.
    """

    _compiled_patterns: Sequence[Tuple[str, Pattern[str], float]] = tuple(
        (
            pii_type,
            re.compile(pattern, flags=re.IGNORECASE),
            confidence,
        )
        for pii_type, pattern, confidence in PII_PATTERNS
    )

    def detect(self, text: str) -> List[PiiFact]:
        if not text or not text.strip():
            return []

        findings: List[PiiFact] = []
        occupied_spans: List[Tuple[int, int]] = []

        for pii_type, regex, confidence in self._compiled_patterns:
            for match in regex.finditer(text):
                span = (match.start(), match.end())

                if self._overlaps_existing(span, occupied_spans):
                    continue

                value = self._extract_value(match)
                evidence = self._extract_evidence(text, match.start(), match.end())

                findings.append(
                    PiiFact(
                        pii_type=pii_type,
                        value=value,
                        evidence=evidence,
                        character_start=match.start(),
                        character_end=match.end(),
                        confidence=confidence,
                        qc_required=confidence < 0.85,
                    )
                )

                occupied_spans.append(span)

        findings.sort(key=lambda item: (item.character_start, item.character_end))
        return findings

    def detect_as_dicts(self, text: str) -> List[Dict[str, object]]:
        return [asdict(fact) for fact in self.detect(text)]

    @staticmethod
    def to_dict(fact: PiiFact) -> Dict[str, object]:
        return asdict(fact)

    @staticmethod
    def to_dict_list(facts: List[PiiFact]) -> List[Dict[str, object]]:
        return [asdict(fact) for fact in facts]

    @staticmethod
    def _extract_value(match: re.Match[str]) -> str:
        groups = match.groupdict()

        value = groups.get("value")
        if value:
            return value.strip()

        return match.group(0).strip()

    @staticmethod
    def _extract_evidence(
        text: str,
        start: int,
        end: int,
        window: int = 80,
    ) -> str:
        evidence_start = max(0, start - window)
        evidence_end = min(len(text), end + window)

        return re.sub(r"\s+", " ", text[evidence_start:evidence_end].strip())

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
        "A 45-year-old male patient with initials AB developed hepatic failure. "
        "The patient was born in 1979. DOB: 12/05/1979 was mentioned."
    )

    service = PiiDetectionService()
    print(service.detect_as_dicts(sample))