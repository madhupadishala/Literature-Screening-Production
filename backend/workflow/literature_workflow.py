from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict

from backend.agents.hits.orchestrator import HitsOrchestrator
from backend.agents.screening import ScreeningOrchestrator
from backend.services.intake_input import IntakeInputBuilder


class LiteratureWorkflow:
    def __init__(self, product_master_path: str | Path) -> None:
        self.product_master_path = Path(product_master_path)
        self.hits_orchestrator = HitsOrchestrator(self.product_master_path)
        self.screening_orchestrator = ScreeningOrchestrator()
        self.intake_input_builder = IntakeInputBuilder()

    def run_package(
        self,
        tenant_id: str,
        package_dir: str | Path,
    ) -> Dict[str, Any]:
        package = Path(package_dir)
        article = self._load_article(package)

        hits_rows = self.hits_orchestrator.run(
            tenant_id=tenant_id,
            article=article,
        )

        hits_payload = {
            "tenant_id": tenant_id,
            "pmid": article.get("pmid"),
            "hits_count": len(hits_rows),
            "hits": hits_rows,
        }

        self._write_json(package / "hits_output.json", hits_payload)

        screening_rows = [
            self.screening_orchestrator.run(
                tenant_id=tenant_id,
                article=article,
                hits_output=hit,
            )
            for hit in hits_rows
        ]

        screening_payload = {
            "tenant_id": tenant_id,
            "pmid": article.get("pmid"),
            "screening_count": len(screening_rows),
            "screening": screening_rows,
        }

        self._write_json(package / "screening_output.json", screening_payload)

        intake_inputs = []

        for index, screening_row in enumerate(screening_rows):
            if screening_row.get("screening_decision") != "Proceed to Intake":
                continue

            hit_row = hits_rows[index] if index < len(hits_rows) else {}

            intake_input = self.intake_input_builder.build(
                tenant_id=tenant_id,
                article=article,
                screening_row=screening_row,
                hit_row=hit_row,
            )

            intake_inputs.append(asdict(intake_input))

        intake_input_payload = {
            "tenant_id": tenant_id,
            "pmid": article.get("pmid"),
            "intake_input_count": len(intake_inputs),
            "intake_inputs": intake_inputs,
        }

        self._write_json(package / "intake_input.json", intake_input_payload)

        return {
            "article": article,
            "hits_output": hits_payload,
            "screening_output": screening_payload,
            "intake_input": intake_input_payload,
        }

    def _load_article(self, package: Path) -> Dict[str, Any]:
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

    @staticmethod
    def _write_json(path: Path, payload: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )