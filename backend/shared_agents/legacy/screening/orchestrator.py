"""
orchestrator.py
---------------
ClinixAI Screening Orchestrator.

Input:
    Canonical Article / Evidence Package Article
    Hits Output Row

Output:
    Screening Output JSON

Pipeline:
    Article + Hits Output
        ↓
    Product / MAH / COI Assessment
        ↓
    Safety / Special Situation Assessment
        ↓
    Severity / Seriousness Assessment
        ↓
    Patient Safety / PII Assessment
        ↓
    Screening Builder
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping

from backend.services.screening import ScreeningBuilder

from .rules import EXCLUSION_TERMS, SERIOUSNESS_TERMS, SEVERITY_TERMS, SPECIAL_SITUATIONS


EVENT_TERMS = [
    "acute liver injury",
    "liver injury",
    "hepatic injury",
    "hepatotoxicity",
    "toxicity",
    "rash",
    "death",
    "fatal",
    "hospitalization",
    "hospitalisation",
    "adverse event",
    "adverse reaction",
    "side effect",
    "drug reaction",
]


class ScreeningOrchestrator:
    def __init__(self) -> None:
        self.screening_builder = ScreeningBuilder()

    def run(
        self,
        tenant_id: str,
        article: Mapping[str, Any],
        hits_output: Mapping[str, Any],
    ) -> Dict[str, Any]:
        text = self._article_text(article, hits_output)

        company_suspects = self._as_list(
            hits_output.get("company_suspect_drugs")
            or hits_output.get("matched_products")
            or hits_output.get("suspect_products")
            or hits_output.get("product_name")
            or hits_output.get("normalized_identity"),
            ["Not identified"],
        )

        clinical_events = self._as_list(
            hits_output.get("clinical_events")
            or hits_output.get("events")
            or hits_output.get("adverse_events"),
            [],
        )

        if not clinical_events:
            detected_events = [term for term in EVENT_TERMS if term in text]
            clinical_events = detected_events or ["Not identified"]

        special_situations = self._detect_special_situations(text)
        seriousness = self._detect_seriousness(text)
        severity = self._detect_severity(text)
        exclusions = self._detect_exclusion(text)

        active_mah = (
            "Yes"
            if hits_output.get("mah_active") is True
            or hits_output.get("mah_country_match") is True
            or hits_output.get("mah_country_status") == "mah_country_match"
            else "Unknown"
        )

        coi = "Yes" if hits_output.get("country_of_interest") else "Uncertain"

        pii = (
            "Yes"
            if hits_output.get("patient_identification")
            or hits_output.get("pii_detected")
            or hits_output.get("patient_identification_pii") == "Yes"
            or hits_output.get("pii_present") is True
            else "No"
        )

        patient_safety = (
            "Yes"
            if clinical_events != ["Not identified"] or special_situations != ["None identified"]
            else "No"
        )

        if exclusions and patient_safety == "No":
            decision = "Exclude"
        elif patient_safety == "Yes" and company_suspects != ["Not identified"]:
            decision = "Proceed to Intake"
        else:
            decision = "Manual Review Required"

        flags = self._build_flags(
            company_suspects=company_suspects,
            active_mah=active_mah,
            coi=coi,
            patient_safety=patient_safety,
            pii=pii,
            clinical_events=clinical_events,
            special_situations=special_situations,
            exclusions=exclusions,
        )

        screening_output = {
            "tenant_id": tenant_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "pmid": article.get("pmid") or hits_output.get("pmid"),
            "screening_status": "ready",
            "intake_status": "pending",
            "company_suspect_drugs": company_suspects,
            "active_mah": active_mah,
            "co_suspect_drugs": self._as_list(
                hits_output.get("co_suspect_drugs"),
                ["None identified"],
            ),
            "concomitant_medications": self._as_list(
                hits_output.get("concomitant_medications"),
                ["Not reported"],
            ),
            "treatment_medications": self._as_list(
                hits_output.get("treatment_medications"),
                ["Not reported"],
            ),
            "clinical_events": clinical_events,
            "special_situations": special_situations,
            "event_severity": severity,
            "seriousness": seriousness,
            "patient_safety": patient_safety,
            "patient_identification_pii": pii,
            "coi": coi,
            "screening_decision": decision,
            "screening_reasoning": (
                "Screening output generated from Hits output using product, MAH, COI, "
                "patient identification, clinical event, special situation, severity, "
                "seriousness, and exclusion rule checks."
            ),
            "exclusion_terms_detected": exclusions,
            "flags": flags,
        }

        row = self.screening_builder.build(
            tenant_id=tenant_id,
            article=article,
            screening_output=screening_output,
        )

        return asdict(row)

    @staticmethod
    def _article_text(article: Mapping[str, Any], hits_output: Mapping[str, Any]) -> str:
        parts = [
            article.get("title"),
            article.get("abstract"),
            article.get("text"),
            article.get("journal"),
            article.get("evidence_sentence"),
            hits_output.get("evidence_sentence"),
            hits_output.get("ai_summary"),
            hits_output.get("ai_reasoning"),
        ]

        return "\n\n".join(str(part).strip() for part in parts if part).lower()

    @staticmethod
    def _as_list(value: Any, fallback: list[str]) -> list[str]:
        if value is None:
            return fallback

        if isinstance(value, list):
            return value if value else fallback

        if isinstance(value, str):
            return [value] if value.strip() else fallback

        return fallback

    @staticmethod
    def _detect_special_situations(text: str) -> list[str]:
        found = [term for term in SPECIAL_SITUATIONS if term in text]
        return found or ["None identified"]

    @staticmethod
    def _detect_seriousness(text: str) -> str:
        return "Serious" if any(term in text for term in SERIOUSNESS_TERMS) else "Not mentioned"

    @staticmethod
    def _detect_severity(text: str) -> str:
        for severity, terms in SEVERITY_TERMS.items():
            if any(term in text for term in terms):
                return severity

        return "Not mentioned"

    @staticmethod
    def _detect_exclusion(text: str) -> list[str]:
        return [term for term in EXCLUSION_TERMS if term in text]

    @staticmethod
    def _build_flags(
        company_suspects: list[str],
        active_mah: str,
        coi: str,
        patient_safety: str,
        pii: str,
        clinical_events: list[str],
        special_situations: list[str],
        exclusions: list[str],
    ) -> list[str]:
        flags = []

        if company_suspects == ["Not identified"]:
            flags.append("Company suspect product missing")

        if active_mah == "Unknown":
            flags.append("MAH verification required")

        if coi == "Uncertain":
            flags.append("COI uncertain")

        if patient_safety == "No":
            flags.append("No patient safety information detected")

        if pii == "No":
            flags.append("Patient identification not detected")

        if clinical_events == ["Not identified"] and special_situations == ["None identified"]:
            flags.append("Clinical event or special situation missing")

        if exclusions:
            flags.append("Potential exclusion criteria detected")

        return flags


def build_screening_output(article: dict, hits_output: dict) -> dict:
    return ScreeningOrchestrator().run(
        tenant_id=str(hits_output.get("tenant_id", "demo-tenant")),
        article=article,
        hits_output=hits_output,
    )


def _load_json(path: str | Path) -> Dict[str, Any]:
    file_path = Path(path).expanduser().resolve()

    with file_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(description="ClinixAI Screening Orchestrator")

    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--article", required=True)
    parser.add_argument("--hits-output", required=True)
    parser.add_argument("--output", required=False)

    args = parser.parse_args()

    article = _load_json(args.article)
    hits_output = _load_json(args.hits_output)

    orchestrator = ScreeningOrchestrator()

    screening_output = orchestrator.run(
        tenant_id=args.tenant_id,
        article=article,
        hits_output=hits_output,
    )

    output_json = json.dumps(screening_output, indent=2, ensure_ascii=False)

    if args.output:
        output_path = Path(args.output).expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(output_json, encoding="utf-8")

    print(output_json)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())