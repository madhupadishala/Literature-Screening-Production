"""
author_service.py
-----------------
ClinixAI Author Service.

Scope:
    Extract primary author and all authors from canonical article metadata,
    PubMed-style metadata, or evidence-package metadata.

Reusable by:
    - Hits
    - Screening
    - Intake
    - QC
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence


@dataclass(frozen=True)
class AuthorFact:
    primary_author: Optional[str]
    all_authors: List[str]
    author_count: int
    evidence: Optional[str]
    confidence: float
    qc_required: bool
    source: str = "metadata"


class AuthorService:
    """
    Extracts article authors.

    Rules:
        - First author = primary author.
        - Preserve author order from source metadata.
        - If metadata has explicit primary_author, prefer it.
        - Does not determine reporter validity.
    """

    def extract(self, article: Mapping[str, Any]) -> AuthorFact:
        if not isinstance(article, Mapping):
            return AuthorFact(
                primary_author=None,
                all_authors=[],
                author_count=0,
                evidence="Article object is not a valid mapping.",
                confidence=0.0,
                qc_required=True,
            )

        explicit_primary = self._clean_author(
            article.get("primary_author")
            or article.get("first_author")
            or article.get("lead_author")
        )

        authors = self._extract_authors(article)

        if explicit_primary and explicit_primary not in authors:
            authors = [explicit_primary, *authors]

        authors = self._dedupe(authors)

        if not authors:
            return AuthorFact(
                primary_author=None,
                all_authors=[],
                author_count=0,
                evidence="No author metadata found.",
                confidence=0.0,
                qc_required=True,
            )

        primary_author = explicit_primary or authors[0]

        return AuthorFact(
            primary_author=primary_author,
            all_authors=authors,
            author_count=len(authors),
            evidence=", ".join(authors[:6]),
            confidence=0.95,
            qc_required=False,
        )

    @staticmethod
    def to_dict(fact: AuthorFact) -> Dict[str, Any]:
        return asdict(fact)

    def _extract_authors(self, article: Mapping[str, Any]) -> List[str]:
        for key in (
            "authors",
            "author_list",
            "all_authors",
            "pubmed_authors",
        ):
            authors = self._normalize_author_list(article.get(key))
            if authors:
                return authors

        for key in (
            "author",
            "authors_text",
            "author_string",
            "citation_authors",
        ):
            authors = self._normalize_author_list(article.get(key))
            if authors:
                return authors

        metadata = article.get("metadata")
        if isinstance(metadata, Mapping):
            return self._extract_authors(metadata)

        return []

    def _normalize_author_list(self, value: Any) -> List[str]:
        if value is None:
            return []

        if isinstance(value, str):
            if not value.strip():
                return []

            parts = re.split(
                r"\s*(?:;|\||, and | and )\s*",
                value.strip(),
                flags=re.IGNORECASE,
            )
            return self._dedupe([self._clean_author(part) for part in parts])

        if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
            authors: List[str] = []

            for item in value:
                if isinstance(item, Mapping):
                    name = (
                        item.get("name")
                        or item.get("full_name")
                        or item.get("author")
                        or item.get("collective_name")
                        or self._join_name_parts(item)
                    )
                    authors.append(self._clean_author(name))
                else:
                    authors.append(self._clean_author(item))

            return self._dedupe(authors)

        return []

    @staticmethod
    def _join_name_parts(item: Mapping[str, Any]) -> str:
        parts = [
            item.get("last_name") or item.get("lastname") or item.get("surname"),
            item.get("fore_name") or item.get("forename") or item.get("given_name"),
            item.get("initials"),
        ]

        return " ".join(str(part).strip() for part in parts if part)

    @staticmethod
    def _clean_author(value: Any) -> str:
        if value is None:
            return ""

        cleaned = re.sub(r"\s+", " ", str(value).strip())
        cleaned = cleaned.strip(" ,;|")

        if not cleaned:
            return ""

        return cleaned

    @staticmethod
    def _dedupe(values: Sequence[str]) -> List[str]:
        output: List[str] = []
        seen = set()

        for value in values:
            cleaned = re.sub(r"\s+", " ", str(value or "").strip())
            if not cleaned:
                continue

            key = cleaned.lower()
            if key in seen:
                continue

            seen.add(key)
            output.append(cleaned)

        return output


if __name__ == "__main__":
    sample = {
        "pmid": "12345678",
        "title": "Demo article",
        "authors": [
            {"last_name": "Rao", "fore_name": "Madhu", "initials": "M"},
            {"last_name": "Sharma", "fore_name": "Kiran", "initials": "K"},
        ],
    }

    service = AuthorService()
    print(service.to_dict(service.extract(sample)))