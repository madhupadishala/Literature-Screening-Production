from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any, Dict, Mapping, Optional


@dataclass(frozen=True)
class CountryFact:
    country: Optional[str]
    source: str
    evidence: Optional[str]
    confidence: float
    qc_required: bool


class CountryDetector:
    COUNTRY_ALIASES = {
        "usa": "United States",
        "us": "United States",
        "u.s.": "United States",
        "u.s.a.": "United States",
        "united states": "United States",
        "america": "United States",
        "uk": "United Kingdom",
        "u.k.": "United Kingdom",
        "united kingdom": "United Kingdom",
        "england": "United Kingdom",
        "india": "India",
        "germany": "Germany",
        "france": "France",
        "italy": "Italy",
        "spain": "Spain",
        "canada": "Canada",
        "australia": "Australia",
        "japan": "Japan",
        "china": "China",
        "brazil": "Brazil",
        "mexico": "Mexico",
    }

    def detect_from_article(self, article: Mapping[str, Any]) -> CountryFact:
        for key in ("country", "patient_country", "coi_country"):
            country = self.normalize_country(article.get(key))
            if country:
                return CountryFact(country, key, str(article.get(key)), 0.95, False)

        affiliations = article.get("affiliations")
        if affiliations:
            text = " ".join(affiliations) if isinstance(affiliations, list) else str(affiliations)
            country = self.detect_country_from_text(text)
            if country:
                return CountryFact(country, "affiliations", text[:300], 0.85, False)

        for key in ("title", "abstract", "full_text", "text"):
            text = str(article.get(key) or "")
            country = self.detect_country_from_text(text)
            if country:
                return CountryFact(country, key, text[:300], 0.75, False)

        return CountryFact(None, "not_found", "No country detected.", 0.0, True)

    def detect_country_from_text(self, text: str) -> Optional[str]:
        lowered = str(text or "").lower()

        for alias, canonical in sorted(self.COUNTRY_ALIASES.items(), key=lambda x: len(x[0]), reverse=True):
            if re.search(rf"(?<![a-z]){re.escape(alias)}(?![a-z])", lowered):
                return canonical

        return None

    @classmethod
    def normalize_country(cls, value: Any) -> Optional[str]:
        if value is None:
            return None
        cleaned = re.sub(r"\s+", " ", str(value).strip())
        if not cleaned:
            return None
        return cls.COUNTRY_ALIASES.get(cleaned.lower().replace(",", ""), cleaned.title())

    @staticmethod
    def to_dict(fact: CountryFact) -> Dict[str, Any]:
        return asdict(fact)