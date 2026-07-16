"""
hits_builder.py
---------------
ClinixAI Hits Builder.

Scope:
    Convert reusable intelligence facts into final HitsRow output.

Consumes:
    - Canonical Article
    - ProductFact
    - AuthorFact
    - CountryFact
    - MahCountryFact
    - PIIFacts
    - ConfidenceFacts
    - QCFlags

Produces:
    - HitsRow

This builder does not perform extraction.
It only assembles already-extracted facts into workflow output.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence

from .hit_models import HitsRow


class HitsBuilder:
    """
    Builds HitsRow objects from extracted reusable facts.
    """

    def build(
        self,
        tenant_id: str,
        article: Mapping[str, Any],
        product_fact: Optional[Any],
        author_fact: Optional[Any],
        author_country_fact: Optional[Any],
        mah_country_fact: Optional[Any],
        pii_facts: Optional[Sequence[Any]],
        confidence_facts: Optional[Sequence[Any]],
        qc_flags: Optional[Sequence[Any]],
    ) -> HitsRow:
        tenant_id = self._require_text(tenant_id, "tenant_id")

        article_dict = self._to_dict(article)

        product_dict = self._to_dict(product_fact) if product_fact else {}
        author_dict = self._to_dict(author_fact) if author_fact else {}
        author_country_dict = (
            self._to_dict(author_country_fact) if author_country_fact else {}
        )
        mah_country_dict = (
            self._to_dict(mah_country_fact) if mah_country_fact else {}
        )

        pii_dicts = [self._to_dict(item) for item in (pii_facts or [])]
        confidence_dicts = [self._to_dict(item) for item in (confidence_facts or [])]
        qc_flag_dicts = [self._to_dict(item) for item in (qc_flags or [])]

        pmid = self._first_value(
            article_dict,
            ("pmid", "PMID", "pubmed_id", "id"),
        )

        doi = self._first_value(
            article_dict,
            ("doi", "DOI"),
        )

        title = self._first_value(
            article_dict,
            ("title", "article_title"),
        )

        journal = self._first_value(
            article_dict,
            ("journal", "journal_title", "source"),
        )

        publication_date = self._first_value(
            article_dict,
            ("publication_date", "pub_date", "published_date", "date"),
        )

        publication_year = (
            self._first_value(article_dict, ("publication_year", "year"))
            or self._extract_year(publication_date)
        )

        article_type = self._first_value(
            article_dict,
            ("article_type", "publication_type", "study_type"),
        )

        confidence_score = self._overall_confidence(confidence_dicts)
        qc_required = bool(qc_flag_dicts) or any(
            bool(item.get("qc_required")) for item in confidence_dicts
        )

        hit_id = self._build_hit_id(
            tenant_id=tenant_id,
            pmid=pmid,
            doi=doi,
            title=title,
            product_id=product_dict.get("product_id"),
        )

        evidence_sentence = (
            product_dict.get("evidence_sentence")
            or mah_country_dict.get("evidence")
            or author_country_dict.get("evidence")
        )

        return HitsRow(
            hit_id=hit_id,
            tenant_id=tenant_id,
            pmid=pmid,
            doi=doi,
            title=title,
            journal=journal,
            publication_date=publication_date,
            publication_year=publication_year,
            article_type=article_type,
            product_id=product_dict.get("product_id"),
            product_name=product_dict.get("product_name"),
            normalized_identity=product_dict.get("normalized_identity"),
            matched_term=product_dict.get("matched_term"),
            match_type=product_dict.get("match_type"),
            match_source=product_dict.get("match_source"),
            company_product_status=(
                product_dict.get("company_match_status")
                or "not_detected"
            ),
            detected_strength=product_dict.get("detected_strength"),
            detected_formulation=product_dict.get("detected_formulation"),
            primary_author=author_dict.get("primary_author"),
            all_authors=list(author_dict.get("all_authors") or []),
            author_country=author_country_dict.get("country"),
            country_of_interest=(
                mah_country_dict.get("detected_country")
                or author_country_dict.get("country")
            ),
            mah_country_status=(
                mah_country_dict.get("status")
                or "not_validated"
            ),
            mah_country_match=bool(
                mah_country_dict.get("mah_country_match")
            ),
            pii_present=bool(pii_dicts),
            pii_findings=pii_dicts,
            confidence_score=confidence_score,
            qc_required=qc_required,
            qc_flags=qc_flag_dicts,
            evidence_sentence=evidence_sentence,
            ai_summary=self._build_summary(
                title=title,
                product_name=product_dict.get("product_name"),
                country=mah_country_dict.get("detected_country")
                or author_country_dict.get("country"),
                evidence=evidence_sentence,
                confidence_score=confidence_score,
            ),
            raw_facts={
                "article": article_dict,
                "product": product_dict,
                "author": author_dict,
                "author_country": author_country_dict,
                "mah_country": mah_country_dict,
                "pii": pii_dicts,
                "confidence": confidence_dicts,
                "qc_flags": qc_flag_dicts,
            },
        )

    def build_many(
        self,
        tenant_id: str,
        article: Mapping[str, Any],
        product_facts: Sequence[Any],
        author_fact: Optional[Any],
        author_country_fact: Optional[Any],
        mah_country_facts: Sequence[Any],
        pii_facts: Optional[Sequence[Any]],
        confidence_facts_by_product_id: Optional[Mapping[str, Sequence[Any]]] = None,
        qc_flags_by_product_id: Optional[Mapping[str, Sequence[Any]]] = None,
    ) -> List[HitsRow]:
        rows: List[HitsRow] = []

        mah_by_product_id = {
            self._to_dict(fact).get("product_id"): fact
            for fact in mah_country_facts
        }

        for product_fact in product_facts:
            product_dict = self._to_dict(product_fact)
            product_id = product_dict.get("product_id")

            rows.append(
                self.build(
                    tenant_id=tenant_id,
                    article=article,
                    product_fact=product_fact,
                    author_fact=author_fact,
                    author_country_fact=author_country_fact,
                    mah_country_fact=mah_by_product_id.get(product_id),
                    pii_facts=pii_facts,
                    confidence_facts=(
                        confidence_facts_by_product_id or {}
                    ).get(product_id, []),
                    qc_flags=(
                        qc_flags_by_product_id or {}
                    ).get(product_id, []),
                )
            )

        return rows

    @staticmethod
    def to_dict(row: HitsRow) -> Dict[str, Any]:
        return asdict(row)

    @staticmethod
    def to_dict_list(rows: Sequence[HitsRow]) -> List[Dict[str, Any]]:
        return [asdict(row) for row in rows]

    @staticmethod
    def _to_dict(value: Any) -> Dict[str, Any]:
        if value is None:
            return {}

        if isinstance(value, Mapping):
            return dict(value)

        if is_dataclass(value):
            return asdict(value)

        if hasattr(value, "__dict__"):
            return dict(value.__dict__)

        return {}

    @staticmethod
    def _first_value(
        mapping: Mapping[str, Any],
        keys: Sequence[str],
    ) -> Optional[str]:
        for key in keys:
            value = mapping.get(key)
            if value is not None and str(value).strip():
                return str(value).strip()
        return None

    @staticmethod
    def _overall_confidence(
        confidence_facts: Sequence[Mapping[str, Any]],
    ) -> float:
        if not confidence_facts:
            return 0.0

        values: List[float] = []

        for fact in confidence_facts:
            value = fact.get("confidence")
            try:
                score = float(value)
            except (TypeError, ValueError):
                continue

            if score > 1 and score <= 100:
                score = score / 100

            values.append(min(max(score, 0.0), 1.0))

        if not values:
            return 0.0

        return round(sum(values) / len(values), 4)

    @staticmethod
    def _extract_year(value: Optional[str]) -> Optional[str]:
        if not value:
            return None

        match = re.search(r"\b(19\d{2}|20\d{2})\b", str(value))
        if not match:
            return None

        return match.group(1)

    @staticmethod
    def _build_hit_id(
        tenant_id: str,
        pmid: Optional[str],
        doi: Optional[str],
        title: Optional[str],
        product_id: Optional[str],
    ) -> str:
        base = "|".join(
            part or ""
            for part in (
                tenant_id,
                pmid,
                doi,
                title,
                product_id,
            )
        )

        digest = hashlib.sha1(base.encode("utf-8")).hexdigest()[:12]

        if pmid:
            return f"HIT-{pmid}-{digest}"

        return f"HIT-{digest}"

    @staticmethod
    def _build_summary(
        title: Optional[str],
        product_name: Optional[str],
        country: Optional[str],
        evidence: Optional[str],
        confidence_score: float,
    ) -> str:
        parts: List[str] = []

        if product_name:
            parts.append(f"Company product identity detected: {product_name}.")

        if country:
            parts.append(f"Country of interest identified as {country}.")

        if evidence:
            parts.append(f"Supporting evidence: {evidence}")

        if confidence_score:
            parts.append(f"Overall extraction confidence: {round(confidence_score * 100)}%.")

        if not parts and title:
            parts.append(f"Literature hit identified for article: {title}")

        return " ".join(parts) if parts else "Literature hit generated."

    @staticmethod
    def _require_text(value: str, field_name: str) -> str:
        cleaned = str(value or "").strip()

        if not cleaned:
            raise ValueError(f"{field_name} is required.")

        return cleaned