"""
confidence_engine.py
--------------------
ClinixAI Confidence Engine.

Scope:
    Calculate field-level and row-level confidence scores from extracted facts.

Reusable by:
    - Hits
    - Screening
    - Intake
    - QC

This engine does not change business decisions.
It only scores extraction reliability.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence


@dataclass(frozen=True)
class ConfidenceFact:
    field_name: str
    confidence: float
    reason: str
    qc_required: bool


class ConfidenceEngine:
    LOW_CONFIDENCE_THRESHOLD = 0.70
    QC_THRESHOLD = 0.80

    FIELD_WEIGHTS = {
        "product": 0.25,
        "mah_country": 0.20,
        "author": 0.15,
        "author_country": 0.15,
        "pii": 0.10,
        "evidence": 0.10,
        "doi": 0.05,
    }

    def score_field(
        self,
        field_name: str,
        value: Any,
        confidence: Optional[float],
        evidence: Optional[str] = None,
    ) -> ConfidenceFact:
        safe_confidence = self._safe_confidence(confidence)

        if value is None or value == "" or value == []:
            return ConfidenceFact(
                field_name=field_name,
                confidence=0.0,
                reason=f"{field_name} value missing.",
                qc_required=True,
            )

        if safe_confidence < self.LOW_CONFIDENCE_THRESHOLD:
            return ConfidenceFact(
                field_name=field_name,
                confidence=safe_confidence,
                reason=f"{field_name} confidence is low.",
                qc_required=True,
            )

        if not evidence:
            return ConfidenceFact(
                field_name=field_name,
                confidence=min(safe_confidence, 0.80),
                reason=f"{field_name} has value but limited evidence.",
                qc_required=True,
            )

        return ConfidenceFact(
            field_name=field_name,
            confidence=safe_confidence,
            reason=f"{field_name} extracted with supporting evidence.",
            qc_required=safe_confidence < self.QC_THRESHOLD,
        )

    def score_facts(
        self,
        facts: Mapping[str, Any],
    ) -> List[ConfidenceFact]:
        confidence_facts: List[ConfidenceFact] = []

        for field_name, fact in facts.items():
            value = self._extract_value(fact)
            confidence = self._extract_confidence(fact)
            evidence = self._extract_evidence(fact)

            confidence_facts.append(
                self.score_field(
                    field_name=field_name,
                    value=value,
                    confidence=confidence,
                    evidence=evidence,
                )
            )

        return confidence_facts

    def overall_score(
        self,
        confidence_facts: Sequence[ConfidenceFact],
    ) -> float:
        if not confidence_facts:
            return 0.0

        weighted_total = 0.0
        used_weight = 0.0

        for fact in confidence_facts:
            weight = self.FIELD_WEIGHTS.get(fact.field_name, 0.05)
            weighted_total += fact.confidence * weight
            used_weight += weight

        if used_weight == 0:
            return 0.0

        return round(weighted_total / used_weight, 4)

    def qc_required(
        self,
        confidence_facts: Sequence[ConfidenceFact],
    ) -> bool:
        if not confidence_facts:
            return True

        return any(fact.qc_required for fact in confidence_facts)

    def to_dict(self, fact: ConfidenceFact) -> Dict[str, Any]:
        return asdict(fact)

    def to_dict_list(
        self,
        facts: Sequence[ConfidenceFact],
    ) -> List[Dict[str, Any]]:
        return [asdict(fact) for fact in facts]

    @staticmethod
    def _safe_confidence(value: Optional[float]) -> float:
        if value is None:
            return 0.0

        try:
            confidence = float(value)
        except (TypeError, ValueError):
            return 0.0

        if confidence > 1.0 and confidence <= 100.0:
            confidence = confidence / 100.0

        return min(max(confidence, 0.0), 1.0)

    @staticmethod
    def _extract_value(fact: Any) -> Any:
        for key in (
            "value",
            "country",
            "primary_author",
            "product_name",
            "status",
            "doi",
            "pii_findings",
        ):
            if isinstance(fact, Mapping) and key in fact:
                return fact.get(key)

            if hasattr(fact, key):
                return getattr(fact, key)

        return fact

    @staticmethod
    def _extract_confidence(fact: Any) -> float:
        if isinstance(fact, Mapping):
            return ConfidenceEngine._safe_confidence(fact.get("confidence"))

        if hasattr(fact, "confidence"):
            return ConfidenceEngine._safe_confidence(getattr(fact, "confidence"))

        return 0.75 if fact else 0.0

    @staticmethod
    def _extract_evidence(fact: Any) -> Optional[str]:
        for key in ("evidence", "evidence_sentence", "reason"):
            if isinstance(fact, Mapping) and key in fact:
                value = fact.get(key)
                return str(value) if value else None

            if hasattr(fact, key):
                value = getattr(fact, key)
                return str(value) if value else None

        return None