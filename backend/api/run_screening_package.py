from __future__ import annotations

import json
from pathlib import Path

from backend.agents.hits.orchestrator import HitsOrchestrator
from backend.agents.screening import ScreeningOrchestrator


def load_article_from_package(package_dir: str | Path) -> dict:
    package = Path(package_dir)

    metadata_path = package / "metadata.json"
    abstract_path = package / "abstract.txt"

    metadata = {}
    abstract = ""

    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

    if abstract_path.exists():
        abstract = abstract_path.read_text(encoding="utf-8")

    return {
        "pmid": metadata.get("pmid") or package.name.replace("PMID_", ""),
        "title": metadata.get("title", ""),
        "journal": metadata.get("journal", ""),
        "publication_date": metadata.get("publication_date", ""),
        "abstract": abstract,
        "text": abstract,
    }


def run_package(
    tenant_id: str,
    package_dir: str | Path,
    product_master_path: str | Path,
) -> dict:
    package = Path(package_dir)
    article = load_article_from_package(package)

    hits_rows = HitsOrchestrator(product_master_path).run(
        tenant_id=tenant_id,
        article=article,
    )

    hits_payload = {
        "tenant_id": tenant_id,
        "hits_count": len(hits_rows),
        "hits": hits_rows,
    }

    (package / "hits_output.json").write_text(
        json.dumps(hits_payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    screening_outputs = []

    for hit in hits_rows:
        screening_output = ScreeningOrchestrator().run(
            tenant_id=tenant_id,
            article=article,
            hits_output=hit,
        )
        screening_outputs.append(screening_output)

    screening_payload = {
        "tenant_id": tenant_id,
        "pmid": article.get("pmid"),
        "screening_count": len(screening_outputs),
        "screening": screening_outputs,
    }

    (package / "screening_output.json").write_text(
        json.dumps(screening_payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return {
        "article": article,
        "hits_output": hits_payload,
        "screening_output": screening_payload,
    }