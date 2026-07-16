"""
screening.py
------------
ClinixAI Screening API

Executes the Screening Engine using:
    Canonical Article
    Hits Output

Produces:
    screening_output.json
"""

from __future__ import annotations

import json
from pathlib import Path

from backend.agents.screening import ScreeningOrchestrator


class ScreeningApi:

    def __init__(self):
        self.orchestrator = ScreeningOrchestrator()

    def run(
        self,
        tenant_id: str,
        article_path: str | Path,
        hits_output_path: str | Path,
    ):

        article_path = Path(article_path)
        hits_output_path = Path(hits_output_path)

        with article_path.open("r", encoding="utf-8") as f:
            article = json.load(f)

        with hits_output_path.open("r", encoding="utf-8") as f:
            hits_output = json.load(f)

        screening_output = self.orchestrator.run(
            tenant_id=tenant_id,
            article=article,
            hits_output=hits_output,
        )

        output_path = hits_output_path.parent / "screening_output.json"

        output_path.write_text(
            json.dumps(
                screening_output,
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        return screening_output