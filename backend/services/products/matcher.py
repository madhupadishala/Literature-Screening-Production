"""
matcher.py
----------
ClinixAI Product Matcher.

Purpose:
- Detect product identity mentions in article text.
- Match against Client Product Master and optional ClinixAI Drug Knowledge Base.
- Return identity matches only.
- Does NOT decide suspect, treatment, concomitant, causality, or reportability.

Product identity sources:
- product_name
- inn / generic_name
- brand_names
- trade_names
- synonyms
- chemical_names
- salts / salt_forms

Important PV rule:
If a company product is configured, its INN/generic/synonym/salt form can represent
the company product in literature because researchers often publish using generic
or chemical terminology rather than brand names.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional


MATCH_PRIORITY = {
    "brand": 100,
    "trade_name": 100,
    "product_name": 95,
    "generic_name": 94,
    "INN": 94,
    "salt": 92,
    "chemical_name": 90,
    "synonym": 88,
}

MATCH_SOURCE_CLIENT = "CLIENT_PRODUCT_MASTER"
MATCH_SOURCE_CLINIXAI = "CLINIXAI_KNOWLEDGE_BASE"


@dataclass
class ProductEntry:
    product_id: str
    product_name: str
    inn: str = ""
    generic_name: str = ""
    normalized_identity: str = ""
    brand_names: list[str] = field(default_factory=list)
    trade_names: list[str] = field(default_factory=list)
    synonyms: list[str] = field(default_factory=list)
    chemical_names: list[str] = field(default_factory=list)
    salts: list[str] = field(default_factory=list)
    strengths: list[str] = field(default_factory=list)
    formulations: list[str] = field(default_factory=list)
    dosage_forms: list[str] = field(default_factory=list)
    mah_countries: list[str] = field(default_factory=list)
    company: str = ""
    source: str = MATCH_SOURCE_CLIENT


@dataclass
class MatchResult:
    product_id: str
    product_name: str
    inn: str
    normalized_identity: str
    matched_term: str
    matched_dictionary_value: str
    match_type: str
    match_source: str
    base_confidence: int
    character_start: int
    character_end: int


@dataclass
class IndexedTerm:
    term: str
    product_id: str
    match_type: str
    match_source: str
    matched_dictionary_value: str
    base_confidence: int


class ProductMatcher:
    def __init__(
        self,
        product_master_path: Optional[str | Path] = None,
        clinixai_kb_path: Optional[str | Path] = None,
    ):
        self._entries: dict[str, ProductEntry] = {}
        self._term_index: dict[str, list[IndexedTerm]] = {}
        self._compiled_patterns: dict[str, re.Pattern] = {}

        if product_master_path:
            self.load(product_master_path, source=MATCH_SOURCE_CLIENT)

        if clinixai_kb_path:
            self.load(clinixai_kb_path, source=MATCH_SOURCE_CLINIXAI)

    def load(self, path: str | Path, source: str = MATCH_SOURCE_CLIENT) -> None:
        path = Path(path)

        if not path.exists():
            raise FileNotFoundError(f"Product knowledge file not found: {path}")

        raw = json.loads(path.read_text(encoding="utf-8"))
        products = raw.get("products", raw) if isinstance(raw, dict) else raw

        if not isinstance(products, list):
            raise ValueError("Product master must be a list or {'products': [...]} JSON object.")

        for product in products:
            entry = self._to_product_entry(product, source)
            if not entry.product_id:
                continue

            existing = self._entries.get(entry.product_id)
            if existing:
                entry = self._merge_entries(existing, entry)

            self._entries[entry.product_id] = entry

        self._rebuild_index()

    def _to_product_entry(self, product: dict[str, Any], source: str) -> ProductEntry:
        product_name = self._clean(product.get("product_name") or product.get("brand_name") or "")
        inn = self._clean(product.get("inn") or "")
        generic_name = self._clean(product.get("generic_name") or inn or "")

        normalized_identity = self._clean(
            product.get("normalized_identity")
            or generic_name
            or inn
            or product_name
        )

        return ProductEntry(
            product_id=self._clean(product.get("product_id") or product.get("id") or ""),
            product_name=product_name,
            inn=inn,
            generic_name=generic_name,
            normalized_identity=normalized_identity,
            brand_names=self._list(product.get("brand_names") or product.get("brands")),
            trade_names=self._list(product.get("trade_names")),
            synonyms=self._list(product.get("synonyms")),
            chemical_names=self._list(product.get("chemical_names")),
            salts=self._list(product.get("salts") or product.get("salt_forms")),
            strengths=self._list(product.get("strengths")),
            formulations=self._list(product.get("formulations")),
            dosage_forms=self._list(product.get("dosage_forms")),
            mah_countries=self._list(product.get("mah_countries")),
            company=self._clean(product.get("company") or ""),
            source=source,
        )

    def _merge_entries(self, old: ProductEntry, new: ProductEntry) -> ProductEntry:
        return ProductEntry(
            product_id=old.product_id,
            product_name=old.product_name or new.product_name,
            inn=old.inn or new.inn,
            generic_name=old.generic_name or new.generic_name,
            normalized_identity=old.normalized_identity or new.normalized_identity,
            brand_names=self._merge_lists(old.brand_names, new.brand_names),
            trade_names=self._merge_lists(old.trade_names, new.trade_names),
            synonyms=self._merge_lists(old.synonyms, new.synonyms),
            chemical_names=self._merge_lists(old.chemical_names, new.chemical_names),
            salts=self._merge_lists(old.salts, new.salts),
            strengths=self._merge_lists(old.strengths, new.strengths),
            formulations=self._merge_lists(old.formulations, new.formulations),
            dosage_forms=self._merge_lists(old.dosage_forms, new.dosage_forms),
            mah_countries=self._merge_lists(old.mah_countries, new.mah_countries),
            company=old.company or new.company,
            source=old.source,
        )

    def _rebuild_index(self) -> None:
        self._term_index.clear()
        self._compiled_patterns.clear()

        for entry in self._entries.values():
            self._index_entry(entry)

        self._compile_patterns()

    def _index_entry(self, entry: ProductEntry) -> None:
        terms: list[tuple[str, str, str]] = []

        if entry.product_name:
            terms.append((entry.product_name, "product_name", entry.product_name))
        if entry.inn:
            terms.append((entry.inn, "INN", entry.inn))
        if entry.generic_name:
            terms.append((entry.generic_name, "generic_name", entry.generic_name))

        for value in entry.brand_names:
            terms.append((value, "brand", value))
        for value in entry.trade_names:
            terms.append((value, "trade_name", value))
        for value in entry.synonyms:
            terms.append((value, "synonym", entry.normalized_identity or value))
        for value in entry.chemical_names:
            terms.append((value, "chemical_name", entry.normalized_identity or value))
        for value in entry.salts:
            terms.append((value, "salt", entry.normalized_identity or value))

        for raw_term, match_type, dictionary_value in terms:
            term = self._normalize_term(raw_term)
            if not self._is_valid_term(term):
                continue

            indexed = IndexedTerm(
                term=term,
                product_id=entry.product_id,
                match_type=match_type,
                match_source=entry.source,
                matched_dictionary_value=dictionary_value,
                base_confidence=MATCH_PRIORITY.get(match_type, 80),
            )

            self._term_index.setdefault(term.lower(), []).append(indexed)

    def _compile_patterns(self) -> None:
        for term in sorted(self._term_index.keys(), key=len, reverse=True):
            escaped = re.escape(term)

            pattern = (
                rf"(?i)(?<![A-Za-z0-9]){escaped}(?![A-Za-z0-9])"
            )

            self._compiled_patterns[term] = re.compile(pattern)

    def match(self, text: str) -> list[MatchResult]:
        if not text:
            return []

        matches: list[MatchResult] = []
        seen: set[tuple[int, int, str, str]] = set()

        for term, pattern in self._compiled_patterns.items():
            for regex_match in pattern.finditer(text):
                indexed_terms = self._term_index.get(term, [])

                for indexed in indexed_terms:
                    entry = self._entries.get(indexed.product_id)
                    if not entry:
                        continue

                    key = (
                        regex_match.start(),
                        regex_match.end(),
                        indexed.product_id,
                        indexed.match_type,
                    )

                    if key in seen:
                        continue

                    seen.add(key)

                    matches.append(
                        MatchResult(
                            product_id=entry.product_id,
                            product_name=entry.product_name,
                            inn=entry.inn or entry.generic_name,
                            normalized_identity=entry.normalized_identity,
                            matched_term=regex_match.group(0),
                            matched_dictionary_value=indexed.matched_dictionary_value,
                            match_type=indexed.match_type,
                            match_source=indexed.match_source,
                            base_confidence=indexed.base_confidence,
                            character_start=regex_match.start(),
                            character_end=regex_match.end(),
                        )
                    )

        matches.sort(key=lambda item: (item.character_start, -len(item.matched_term)))
        return self._deduplicate_overlapping(matches)

    def deduplicate_by_sentence(
        self,
        matches: list[MatchResult],
        sentence_boundaries: list[tuple[int, int]],
    ) -> list[MatchResult]:
        if not matches or not sentence_boundaries:
            return matches

        grouped: dict[tuple[int, str], list[MatchResult]] = {}

        for match in matches:
            sentence_index = self._find_sentence_index(match.character_start, sentence_boundaries)
            grouped.setdefault((sentence_index, match.product_id), []).append(match)

        deduped: list[MatchResult] = []

        for group in grouped.values():
            deduped.append(self._select_best_match(group))

        deduped.sort(key=lambda item: (item.character_start, item.character_end))
        return deduped

    def _deduplicate_overlapping(self, matches: list[MatchResult]) -> list[MatchResult]:
        if not matches:
            return []

        selected: list[MatchResult] = []

        for candidate in matches:
            overlap = False

            for existing in selected:
                if candidate.product_id != existing.product_id:
                    continue

                if self._spans_overlap(
                    candidate.character_start,
                    candidate.character_end,
                    existing.character_start,
                    existing.character_end,
                ):
                    overlap = True

                    better = self._select_best_match([candidate, existing])
                    if better is candidate:
                        selected.remove(existing)
                        selected.append(candidate)
                    break

            if not overlap:
                selected.append(candidate)

        selected.sort(key=lambda item: (item.character_start, item.character_end))
        return selected

    def _select_best_match(self, group: list[MatchResult]) -> MatchResult:
        return max(
            group,
            key=lambda match: (
                match.base_confidence,
                len(match.matched_term),
                -match.character_start,
            ),
        )

    @staticmethod
    def _find_sentence_index(position: int, boundaries: list[tuple[int, int]]) -> int:
        for index, (start, end) in enumerate(boundaries):
            if start <= position < end:
                return index
        return -1

    @staticmethod
    def _spans_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
        return max(a_start, b_start) < min(a_end, b_end)

    def get_entry(self, product_id: str) -> Optional[ProductEntry]:
        return self._entries.get(product_id)

    def all_entries(self) -> dict[str, ProductEntry]:
        return dict(self._entries)

    @staticmethod
    def _clean(value: Any) -> str:
        return str(value).strip() if value is not None else ""

    @staticmethod
    def _list(value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            if not value.strip():
                return []
            return [item.strip() for item in re.split(r"[;,|]", value) if item.strip()]
        return [str(value).strip()]

    @staticmethod
    def _merge_lists(first: list[str], second: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()

        for item in [*first, *second]:
            key = item.lower().strip()
            if key and key not in seen:
                seen.add(key)
                result.append(item.strip())

        return result

    @staticmethod
    def _normalize_term(term: str) -> str:
        return re.sub(r"\s+", " ", term.strip())

    @staticmethod
    def _is_valid_term(term: str) -> bool:
        if not term:
            return False
        if len(term) == 1:
            return False
        return True


if __name__ == "__main__":
    import tempfile

    sample_master = {
        "products": [
            {
                "product_id": "PID-TYL-001",
                "product_name": "Tylenol",
                "inn": "Paracetamol",
                "generic_name": "Paracetamol",
                "brand_names": ["Tylenol"],
                "synonyms": ["Acetaminophen", "APAP"],
                "salts": ["Paracetamol Sodium"],
                "strengths": ["500 mg", "650 mg"],
                "formulations": ["Tablet", "Syrup"],
            }
        ]
    }

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as handle:
        json.dump(sample_master, handle)
        path = handle.name

    matcher = ProductMatcher(path)
    sample_text = (
        "Acetaminophen-induced liver injury was reported. "
        "Paracetamol Sodium 500 mg tablet was used. "
        "APAP was also mentioned."
    )

    for result in matcher.match(sample_text):
        print(result)