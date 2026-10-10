"""
orchestrator.py
---------------
ClinixAI Hits Orchestrator.

Runs reusable literature intelligence services and produces HitsRow JSON.

Pipeline:
    Canonical Article
        ↓
    Product Detection
        ↓
    Author Extraction
        ↓
    Country Detection
        ↓
    MAH Country Validation
        ↓
    PII Detection
        ↓
    Confidence Engine
        ↓
    QC Flag Engine
        ↓
    Hits Builder
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

from backend.services.authors import AuthorService
from backend.services.confidence import ConfidenceEngine
from backend.services.countries import CountryDetector, MahCountryService
from backend.services.hits import HitsBuilder
from backend.services.pii import PiiDetectionService
from backend.services.products.product_service import ProductDetectionService
from backend.services.qc import QcFlagEngine


class HitsOrchestrator:
    def __init__(self, product_master_path: str | Path) -> None:
        self.product_service = ProductDetectionService(product_master_path)
        self.author_service = AuthorService()
        self.country_detector = CountryDetector()
        self.mah_country_service = MahCountryService()
        self.pii_service = PiiDetectionService()
        self.confidence_engine = ConfidenceEngine()
        self.qc_engine = QcFlagEngine()
        self.hits_builder = HitsBuilder()

    def run(
        self,
        tenant_id: str,
        article: Mapping[str, Any],
    ) -> List[Dict[str, Any]]:
        article_text = self._article_text(article)

        product_facts = self.product_service.detect(
            article_text=article_text,
            tenant_id=tenant_id,
            source_section="Abstract",
        )

        author_fact = self.author_service.extract(article)
        country_fact = self.country_detector.detect_from_article(article)
        pii_facts = self.pii_service.detect(article_text)

        rows = []

        for product_fact in product_facts:
            product_record = self.product_service.matcher.get_entry(product_fact.product_id)
            product_record_dict = self._to_dict(product_record)

            mah_fact = self.mah_country_service.validate(
                product_fact=product_fact,
                detected_country=country_fact.country,
                product_master_record=product_record_dict,
            )

            fact_bundle = {
                "product": product_fact,
                "author": author_fact,
                "author_country": country_fact,
                "mah_country": mah_fact,
                "pii": pii_facts,
                "evidence": product_fact.evidence_sentence,
            }

            confidence_facts = self.confidence_engine.score_facts(fact_bundle)

            qc_flags = self.qc_engine.generate(
                facts=fact_bundle,
                confidence_facts=confidence_facts,
            )

            row = self.hits_builder.build(
                tenant_id=tenant_id,
                article=article,
                product_fact=product_fact,
                author_fact=author_fact,
                author_country_fact=country_fact,
                mah_country_fact=mah_fact,
                pii_facts=pii_facts,
                confidence_facts=confidence_facts,
                qc_flags=qc_flags,
            )

            rows.append(asdict(row))

        return rows

    @staticmethod
    def _article_text(article: Mapping[str, Any]) -> str:
        parts = [
            article.get("title"),
            article.get("abstract"),
            article.get("full_text"),
            article.get("text"),
        ]

        return "\n\n".join(str(part).strip() for part in parts if part)

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


def _load_json(path: str | Path) -> Dict[str, Any]:
    file_path = Path(path).expanduser().resolve()

    with file_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(description="ClinixAI Hits Orchestrator")

    parser.add_argument(
        "--tenant-id",
        required=True,
        help="Tenant identifier.",
    )

    parser.add_argument(
        "--product-master",
        required=True,
        help="Path to Product Master JSON.",
    )

    parser.add_argument(
        "--article",
        required=True,
        help="Path to canonical article JSON.",
    )

    parser.add_argument(
        "--output",
        required=False,
        help="Optional output JSON path.",
    )

    args = parser.parse_args()

    article = _load_json(args.article)

    orchestrator = HitsOrchestrator(
        product_master_path=args.product_master,
    )

    rows = orchestrator.run(
        tenant_id=args.tenant_id,
        article=article,
    )

    payload = {
        "tenant_id": args.tenant_id,
        "hits_count": len(rows),
        "hits": rows,
    }

    output_json = json.dumps(payload, indent=2, ensure_ascii=False)

    if args.output:
        output_path = Path(args.output).expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(output_json, encoding="utf-8")

    print(output_json)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())