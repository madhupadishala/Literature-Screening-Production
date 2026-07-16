"""
mah_country_service.py
----------------------
ClinixAI MAH Country Service.

Scope:
    Validate whether detected article/country of interest is covered by the
    product's configured MAH countries.

Does not decide:
    - case validity
    - seriousness
    - causality
    - reportability
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any, Dict, Iterable, List, Mapping, Optional

from .country_detector import CountryDetector


@dataclass(frozen=True)
class MahCountryFact:
    product_id: Optional[str]
    product_name: Optional[str]
    detected_country: Optional[str]
    mah_countries: List[str]
    mah_country_match: bool
    status: str
    evidence: Optional[str]
    confidence: float
    qc_required: bool


class MahCountryService:
    def __init__(self) -> None:
        self.country_detector = CountryDetector()

    def validate(
        self,
        product_fact: Any,
        detected_country: Optional[str],
        product_master_record: Optional[Mapping[str, Any]],
    ) -> MahCountryFact:
        product_id = str(getattr(product_fact, "product_id", "") or "") or None
        product_name = str(getattr(product_fact, "product_name", "") or "") or None

        country = self.country_detector.normalize_country(detected_country)
        mah_countries = self._extract_mah_countries(product_master_record)

        if not country:
            return MahCountryFact(
                product_id=product_id,
                product_name=product_name,
                detected_country=None,
                mah_countries=mah_countries,
                mah_country_match=False,
                status="qc_required",
                evidence="Country could not be determined.",
                confidence=0.40,
                qc_required=True,
            )

        if not mah_countries:
            return MahCountryFact(
                product_id=product_id,
                product_name=product_name,
                detected_country=country,
                mah_countries=[],
                mah_country_match=False,
                status="qc_required",
                evidence="MAH country list unavailable in Product Master.",
                confidence=0.50,
                qc_required=True,
            )

        normalized_mah = {
            self.country_detector.normalize_country(value)
            for value in mah_countries
        }

        if country in normalized_mah:
            return MahCountryFact(
                product_id=product_id,
                product_name=product_name,
                detected_country=country,
                mah_countries=mah_countries,
                mah_country_match=True,
                status="mah_country_match",
                evidence=f"{country} is configured as MAH country.",
                confidence=0.95,
                qc_required=False,
            )

        return MahCountryFact(
            product_id=product_id,
            product_name=product_name,
            detected_country=country,
            mah_countries=mah_countries,
            mah_country_match=False,
            status="mah_country_mismatch",
            evidence=f"{country} is not configured as MAH country.",
            confidence=0.90,
            qc_required=False,
        )

    @staticmethod
    def to_dict(fact: MahCountryFact) -> Dict[str, Any]:
        return asdict(fact)

    @staticmethod
    def _extract_mah_countries(
        product_master_record: Optional[Mapping[str, Any]],
    ) -> List[str]:
        if not product_master_record:
            return []

        values: List[str] = []

        for key in (
            "mah_countries",
            "mah_country",
            "marketing_authorization_countries",
            "authorized_countries",
            "countries",
        ):
            raw = product_master_record.get(key)

            if raw is None:
                continue

            if isinstance(raw, str):
                values.extend(
                    item.strip()
                    for item in re.split(r"[;,|]", raw)
                    if item.strip()
                )
            elif isinstance(raw, Iterable):
                for item in raw:
                    if item is not None and str(item).strip():
                        values.append(str(item).strip())

        output: List[str] = []
        seen = set()

        for value in values:
            key = value.lower()
            if key not in seen:
                seen.add(key)
                output.append(value)

        return output