"""
qc_flag_engine.py
-----------------
ClinixAI QC Flag Engine.

Scope:
    Generate human-review flags from extracted facts and confidence outputs.

Reusable by:
    - Hits
    - Screening
    - Intake
    - QC

This engine does not override extracted facts.
It only marks what needs human verification.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence


@dataclass(frozen=True)
class QcFlag:
    field_name: str
    severity: str
    reason: str
    evidence: Optional[str] = None


class QcFlagEngine:
    """
    Produces QC flags based on missing, low-confidence, mismatched, or ambiguous facts.
    """

    def generate(
        self,
        facts: Mapping[str, Any],
        confidence_facts: Optional[Sequence[Any]] = None,
    ) -> List[QcFlag]:
        flags: List[QcFlag] = []

        flags.extend(self._flags_from_facts(facts))

        if confidence_facts:
            flags.extend(self._flags_from_confidence(confidence_facts))

        return self._dedupe(flags)

    def to_dict(self, flag: QcFlag) -> Dict[str, Any]:
        return asdict(flag)

    def to_dict_list(self, flags: Sequence[QcFlag]) -> List[Dict[str, Any]]:
        return [asdict(flag) for flag in flags]

    def _flags_from_facts(self, facts: Mapping[str, Any]) -> List[QcFlag]:
        flags: List[QcFlag] = []

        product_fact = facts.get("product")
        if product_fact is None:
            flags.append(
                QcFlag(
                    field_name="product",
                    severity="critical",
                    reason="No company product identity detected.",
                )
            )
        else:
            product_status = self._get(product_fact, "company_match_status")
            if product_status in {"qc_required", "possible_company_product"}:
                flags.append(
                    QcFlag(
                        field_name="product",
                        severity="high",
                        reason=f"Product requires QC review: {product_status}.",
                        evidence=self._get(product_fact, "evidence_sentence"),
                    )
                )
            elif product_status in {"non_company_product", "not_company_product"}:
                flags.append(
                    QcFlag(
                        field_name="product",
                        severity="medium",
                        reason="Product matched identity but failed company product validation.",
                        evidence=self._get(product_fact, "evidence_sentence"),
                    )
                )

        mah_fact = facts.get("mah_country")
        if mah_fact is None:
            flags.append(
                QcFlag(
                    field_name="mah_country",
                    severity="high",
                    reason="MAH country validation is missing.",
                )
            )
        else:
            mah_status = self._get(mah_fact, "status")
            if mah_status == "qc_required":
                flags.append(
                    QcFlag(
                        field_name="mah_country",
                        severity="high",
                        reason="MAH country could not be automatically validated.",
                        evidence=self._get(mah_fact, "evidence"),
                    )
                )
            elif mah_status == "mah_country_mismatch":
                flags.append(
                    QcFlag(
                        field_name="mah_country",
                        severity="medium",
                        reason="Detected country is not configured as MAH country.",
                        evidence=self._get(mah_fact, "evidence"),
                    )
                )

        author_fact = facts.get("author")
        if author_fact is None or not self._get(author_fact, "primary_author"):
            flags.append(
                QcFlag(
                    field_name="primary_author",
                    severity="medium",
                    reason="Primary author could not be extracted.",
                    evidence=self._get(author_fact, "evidence") if author_fact else None,
                )
            )

        author_country_fact = facts.get("author_country")
        if author_country_fact is None or not self._get(author_country_fact, "country"):
            flags.append(
                QcFlag(
                    field_name="author_country",
                    severity="medium",
                    reason="Author country could not be extracted.",
                    evidence=self._get(author_country_fact, "evidence")
                    if author_country_fact
                    else None,
                )
            )

        pii_facts = facts.get("pii")
        if pii_facts is None:
            flags.append(
                QcFlag(
                    field_name="pii",
                    severity="low",
                    reason="PII detection was not run.",
                )
            )
        elif isinstance(pii_facts, Sequence) and not isinstance(pii_facts, (str, bytes)):
            low_confidence_pii = [
                item for item in pii_facts if self._get(item, "qc_required")
            ]
            if low_confidence_pii:
                flags.append(
                    QcFlag(
                        field_name="pii",
                        severity="low",
                        reason="Some PII findings require manual verification.",
                        evidence=self._get(low_confidence_pii[0], "evidence"),
                    )
                )

        return flags

    def _flags_from_confidence(
        self,
        confidence_facts: Sequence[Any],
    ) -> List[QcFlag]:
        flags: List[QcFlag] = []

        for fact in confidence_facts:
            qc_required = self._get(fact, "qc_required")
            confidence = self._get(fact, "confidence")
            field_name = self._get(fact, "field_name") or "unknown"
            reason = self._get(fact, "reason") or "Low confidence."

            if qc_required:
                flags.append(
                    QcFlag(
                        field_name=str(field_name),
                        severity=self._severity_from_confidence(confidence),
                        reason=str(reason),
                    )
                )

        return flags

    @staticmethod
    def _severity_from_confidence(confidence: Any) -> str:
        try:
            score = float(confidence)
        except (TypeError, ValueError):
            return "medium"

        if score < 0.50:
            return "high"

        if score < 0.75:
            return "medium"

        return "low"

    @staticmethod
    def _get(obj: Any, key: str) -> Any:
        if obj is None:
            return None

        if isinstance(obj, Mapping):
            return obj.get(key)

        return getattr(obj, key, None)

    @staticmethod
    def _dedupe(flags: Sequence[QcFlag]) -> List[QcFlag]:
        output: List[QcFlag] = []
        seen = set()

        for flag in flags:
            key = (
                flag.field_name,
                flag.severity,
                flag.reason,
                flag.evidence,
            )

            if key in seen:
                continue

            seen.add(key)
            output.append(flag)

        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}

        output.sort(
            key=lambda item: (
                severity_order.get(item.severity, 99),
                item.field_name,
            )
        )

        return output