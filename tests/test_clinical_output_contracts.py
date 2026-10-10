"""Clinical output contract validation: evidence, uncertainty and no auto-release."""
import hashlib
import unittest
from pydantic import ValidationError
from backend.agents.clinical_contracts import (
    ClinicalFinding, ClinicalStatus, EvidenceReference, AgentClinicalResponse
)


class ClinicalContractsTests(unittest.TestCase):
    def test_supported_finding_requires_evidence(self):
        with self.assertRaises(ValidationError):
            ClinicalFinding(field="event", value="rash", status=ClinicalStatus.SUPPORTED,
                            rationale="source-backed")

    def test_quote_must_match_source_offsets(self):
        source = "Rash appeared after Drug A."
        quote = EvidenceReference(document_id="doc1", exact_quote="Rash", start=0, end=4)
        quote.validate_against(source)
        with self.assertRaises(ValueError):
            quote.model_copy(update={"start": 1}).validate_against(source)

    def test_unknown_cannot_bypass_review(self):
        with self.assertRaises(ValidationError):
            ClinicalFinding(field="country", status=ClinicalStatus.UNKNOWN,
                            rationale="absent", reviewer_required=False)

    def test_output_cannot_enable_autorelease(self):
        with self.assertRaises(ValidationError):
            AgentClinicalResponse(agent_id="event", tenant_id="t1", client_id="c1",
                                  case_id="case", input_sha256=hashlib.sha256(b"data").hexdigest(),
                                  autonomous_release=True)

    def test_supported_quote_and_output(self):
        source = "A rash occurred."
        quote = EvidenceReference(document_id="d", exact_quote="rash", start=2, end=6)
        result = AgentClinicalResponse(
            agent_id="event", tenant_id="t", client_id="c", case_id="case",
            input_sha256=hashlib.sha256(source.encode()).hexdigest(),
            findings=[ClinicalFinding(field="event", value="rash",
                status=ClinicalStatus.SUPPORTED, evidence=[quote],
                rationale="explicit adverse event")])
        result.validate_grounding(source)

if __name__ == "__main__":
    unittest.main()
