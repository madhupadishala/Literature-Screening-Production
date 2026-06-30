"""
route_detector.py
-----------------
ClinixAI administration route detector.

IMPORTANT:
    Route is NOT used for company product identity matching.

This module exists only as a reusable clinical text utility for later engines:
    - Screening
    - Intake
    - Case processing
    - QC

Product Detection Service must not use route to accept/reject company products.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Dict, List, Pattern, Sequence, Tuple


ROUTE_PATTERNS: Sequence[Tuple[str, str]] = (
    ("intravenous", r"\b(?:intravenous|intravenously|iv|i\.v\.|i/v)\b"),
    ("intramuscular", r"\b(?:intramuscular|intramuscularly|im|i\.m\.|i/m)\b"),
    ("subcutaneous", r"\b(?:subcutaneous|subcutaneously|sc|s\.c\.|s/c|subcut)\b"),
    ("oral", r"\b(?:oral|orally|po|p\.o\.|per\s+os|by\s+mouth)\b"),
    ("topical", r"\b(?:topical|topically|cutaneous|dermal|transdermal)\b"),
    ("ophthalmic", r"\b(?:ophthalmic|ophthalmically|ocular|eye\s+drops?)\b"),
    ("otic", r"\b(?:otic|auricular|ear\s+drops?)\b"),
    ("nasal", r"\b(?:nasal|intranasal|intranasally|nasally)\b"),
    ("inhalation", r"\b(?:inhalation|inhaled|inhalational|inhalationally|nebulized|nebulised)\b"),
    ("sublingual", r"\b(?:sublingual|sublingually|under\s+the\s+tongue)\b"),
    ("buccal", r"\b(?:buccal|buccally)\b"),
    ("rectal", r"\b(?:rectal|rectally|per\s+rectum|pr|p\.r\.)\b"),
    ("vaginal", r"\b(?:vaginal|vaginally)\b"),
    ("intradermal", r"\b(?:intradermal|intradermally|i\.d\.|id)\b"),
    ("intrathecal", r"\b(?:intrathecal|intrathecally)\b"),
    ("epidural", r"\b(?:epidural|epidurally)\b"),
    ("intraarticular", r"\b(?:intra[-\s]?articular|intraarticularly)\b"),
    ("intraperitoneal", r"\b(?:intraperitoneal|intraperitoneally|ip|i\.p\.)\b"),
)


@dataclass(frozen=True)
class RouteMention:
    route: str
    matched_text: str
    character_start: int
    character_end: int


class RouteDetector:
    """
    Detects administration route mentions in medical text.

    This detector performs route recognition only.
    It does not infer product relationship, causality, or company match.
    """

    _compiled_patterns: Dict[str, Pattern[str]] = {
        route: re.compile(pattern, flags=re.IGNORECASE)
        for route, pattern in ROUTE_PATTERNS
    }

    def detect(self, text: str) -> List[Dict[str, object]]:
        if not text or not text.strip():
            return []

        mentions: List[RouteMention] = []
        seen_spans: set[Tuple[int, int]] = set()

        for route, regex in self._compiled_patterns.items():
            for match in regex.finditer(text):
                span = (match.start(), match.end())

                if span in seen_spans:
                    continue

                seen_spans.add(span)

                mentions.append(
                    RouteMention(
                        route=route,
                        matched_text=match.group(0),
                        character_start=match.start(),
                        character_end=match.end(),
                    )
                )

        mentions.sort(key=lambda item: (item.character_start, item.character_end, item.route))
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


if __name__ == "__main__":
    sample = (
        "The patient received paracetamol 500 mg orally, "
        "morphine 10 mg IV, insulin SC, and a topical cream."
    )

    detector = RouteDetector()
    print(detector.detect(sample))