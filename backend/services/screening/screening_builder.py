from typing import Any, Mapping

from .screening_models import ScreeningRow


class ScreeningBuilder:
    def build(
        self,
        tenant_id: str,
        article: Mapping[str, Any],
        screening_output: Mapping[str, Any],
    ) -> ScreeningRow:
        return ScreeningRow(
            tenant_id=tenant_id,
            pmid=str(article.get("pmid") or screening_output.get("pmid") or ""),

            screening_status=str(screening_output.get("screening_status", "ready")),
            intake_status=str(screening_output.get("intake_status", "pending")),

            company_suspect_drugs=list(
                screening_output.get("company_suspect_drugs", ["Not identified"])
            ),
            active_mah=str(screening_output.get("active_mah", "Unknown")),
            co_suspect_drugs=list(
                screening_output.get("co_suspect_drugs", ["None identified"])
            ),
            concomitant_medications=list(
                screening_output.get("concomitant_medications", ["Not reported"])
            ),
            treatment_medications=list(
                screening_output.get("treatment_medications", ["Not reported"])
            ),

            clinical_events=list(screening_output.get("clinical_events", ["Not identified"])),
            special_situations=list(
                screening_output.get("special_situations", ["None identified"])
            ),
            event_severity=str(screening_output.get("event_severity", "Not mentioned")),
            seriousness=str(screening_output.get("seriousness", "Not mentioned")),
            patient_safety=str(screening_output.get("patient_safety", "No")),
            patient_identification_pii=str(
                screening_output.get("patient_identification_pii", "No")
            ),
            coi=str(screening_output.get("coi", "Uncertain")),

            screening_decision=str(
                screening_output.get("screening_decision", "Manual Review Required")
            ),
            screening_reasoning=str(screening_output.get("screening_reasoning", "")),

            generated_at=str(screening_output.get("generated_at", "")),
            exclusion_terms_detected=list(
                screening_output.get("exclusion_terms_detected", [])
            ),
            flags=list(screening_output.get("flags", [])),
        )