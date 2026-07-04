from typing import Any, Mapping

from .intake_input_models import IntakeInputPackage


class IntakeInputBuilder:
    def build(
        self,
        tenant_id: str,
        article: Mapping[str, Any],
        screening_row: Mapping[str, Any],
        hit_row: Mapping[str, Any],
    ) -> IntakeInputPackage:
        return IntakeInputPackage(
            tenant_id=tenant_id,
            source_type="Literature",
            pmid=str(screening_row.get("pmid") or article.get("pmid") or ""),
            title=str(hit_row.get("title") or article.get("title") or ""),
            journal=str(hit_row.get("journal") or article.get("journal") or ""),
            publication_date=str(
                hit_row.get("publication_date") or article.get("publication_date") or ""
            ),
            country=str(hit_row.get("country_of_interest") or screening_row.get("coi") or ""),
            company_suspect_drugs=list(
                screening_row.get("company_suspect_drugs", ["Not identified"])
            ),
            clinical_events=list(screening_row.get("clinical_events", ["Not identified"])),
            special_situations=list(
                screening_row.get("special_situations", ["None identified"])
            ),
            patient_safety=str(screening_row.get("patient_safety", "No")),
            patient_identification_pii=str(
                screening_row.get("patient_identification_pii", "No")
            ),
            coi=str(screening_row.get("coi", "Uncertain")),
            active_mah=str(screening_row.get("active_mah", "Unknown")),
            screening_decision=str(
                screening_row.get("screening_decision", "Manual Review Required")
            ),
            evidence_sentence=str(hit_row.get("evidence_sentence") or ""),
            screening_flags=list(screening_row.get("flags", [])),
        )