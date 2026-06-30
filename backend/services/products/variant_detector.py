"""
variant_detector.py
-------------------
ClinixAI Pharmaceutical Formulation Detector.

Scope:
    Detect pharmaceutical dosage form / formulation mentions in medical text.

This module DOES NOT detect:
    - route of administration
    - suspect product role
    - treatment/concomitant role
    - causality
    - medical history medication

Important:
    Route must not be used for company product matching.

Examples:
    tablet
    capsule
    injection
    solution
    oral suspension
    cream
    gel
    ointment
    transdermal patch
    prefilled syringe
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Dict, List, Pattern, Sequence, Tuple


FORMULATION_PATTERNS: Sequence[Tuple[str, str]] = (
    ("prefilled syringe", r"\bpre[-\s]?filled\s+syringes?\b"),
    ("oral suspension", r"\boral\s+suspensions?\b"),
    ("extended release tablet", r"\b(?:extended[-\s]?release|ER|XR|SR|CR|MR)\s+tablets?\b"),
    ("delayed release tablet", r"\b(?:delayed[-\s]?release|DR)\s+tablets?\b"),
    ("film coated tablet", r"\bfilm[-\s]?coated\s+tablets?\b"),
    ("chewable tablet", r"\bchewable\s+tablets?\b"),
    ("dispersible tablet", r"\bdispersible\s+tablets?\b"),
    ("effervescent tablet", r"\beffervescent\s+tablets?\b"),
    ("orodispersible tablet", r"\b(?:orodispersible|orally\s+disintegrating|ODT)\s+tablets?\b"),
    ("tablet", r"\btablets?\b"),
    ("capsule", r"\bcapsules?\b"),
    ("softgel capsule", r"\bsoft[-\s]?gel\s+capsules?\b"),
    ("hard gelatin capsule", r"\bhard\s+gelatin\s+capsules?\b"),
    ("injection", r"\binjections?\b"),
    ("solution for injection", r"\bsolutions?\s+for\s+injections?\b"),
    ("infusion", r"\binfusions?\b"),
    ("solution for infusion", r"\bsolutions?\s+for\s+infusions?\b"),
    ("syrup", r"\bsyrups?\b"),
    ("solution", r"\bsolutions?\b"),
    ("suspension", r"\bsuspensions?\b"),
    ("cream", r"\bcreams?\b"),
    ("gel", r"\bgels?\b"),
    ("ointment", r"\bointments?\b"),
    ("lotion", r"\blotions?\b"),
    ("paste", r"\bpastes?\b"),
    ("transdermal patch", r"\btransdermal\s+patch(?:es)?\b"),
    ("patch", r"\bpatch(?:es)?\b"),
    ("powder", r"\bpowders?\b"),
    ("granules", r"\bgranules?\b"),
    ("spray", r"\bsprays?\b"),
    ("aerosol", r"\baerosols?\b"),
    ("inhaler", r"\binhalers?\b"),
    ("nebuliser solution", r"\bnebuliser\s+solutions?\b"),
    ("nebulizer solution", r"\bnebulizer\s+solutions?\b"),
    ("eye drops", r"\beye\s+drops?\b"),
    ("ear drops", r"\bear\s+drops?\b"),
    ("nasal drops", r"\bnasal\s+drops?\b"),
    ("drops", r"\bdrops?\b"),
    ("suppository", r"\bsuppositor(?:y|ies)\b"),
    ("pessary", r"\bpessar(?:y|ies)\b"),
    ("implant", r"\bimplants?\b"),
    ("vial", r"\bvials?\b"),
    ("ampoule", r"\bampoules?\b|\bampules?\b"),
    ("pen", r"\bpens?\b"),
)


@dataclass(frozen=True)
class FormulationMention:
    formulation: str
    variant: str
    matched_text: str
    character_start: int
    character_end: int
    confidence: float


class VariantDetector:
    """
    Detects pharmaceutical formulation mentions.

    The class name is kept as VariantDetector for backward compatibility with
    existing imports, but the output includes both:
        - formulation
        - variant
    """

    _compiled_patterns: Dict[str, Pattern[str]] = {
        formulation: re.compile(pattern, flags=re.IGNORECASE)
        for formulation, pattern in FORMULATION_PATTERNS
    }

    def detect(self, text: str) -> List[Dict[str, object]]:
        if not text or not text.strip():
            return []

        mentions: List[FormulationMention] = []
        occupied_spans: List[Tuple[int, int]] = []

        for formulation, regex in self._compiled_patterns.items():
            for match in regex.finditer(text):
                span = (match.start(), match.end())

                if self._overlaps_existing(span, occupied_spans):
                    continue

                occupied_spans.append(span)

                mentions.append(
                    FormulationMention(
                        formulation=formulation,
                        variant=formulation,
                        matched_text=match.group(0),
                        character_start=match.start(),
                        character_end=match.end(),
                        confidence=1.0,
                    )
                )

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
        "The patient received Tylenol 500 mg tablets. "
        "A topical cream was applied. "
        "The report also mentioned a solution for injection, "
        "a prefilled syringe, and a transdermal patch."
    )

    detector = VariantDetector()
    print(detector.detect(sample))