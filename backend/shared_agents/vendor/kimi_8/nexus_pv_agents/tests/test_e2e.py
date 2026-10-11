"""End-to-end pharmacovigilance workflow tests (Phase 6)."""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from nexus_agents.orchestration import (AgentSuite, LangGraphAdapter,
                                        followup_icsr_workflow,
                                        literature_workflow,
                                        spontaneous_icsr_workflow)
from nexus_agents.schemas import (AdverseEvent, DrugExposure, ICSR,
                                  LiteratureArticle, PatientInfo, ReporterInfo,
                                  Sex)


def _suite():
    return AgentSuite()


def test_literature_workflow_end_to_end():
    suite = _suite()
    existing = [LiteratureArticle(
        record_id="LIT-old", pmid="38001122",
        title="Severe cutaneous reaction associated with nexiumab: a case report",
        authors=["Smith J"], year=2024)]
    incoming = LiteratureArticle(
        record_id="LIT-new", pmid="38001122",
        title="Severe cutaneous reaction associated with nexiumab: a case report",
        authors=["Smith J"], year=2024)
    out = literature_workflow(suite, incoming, existing, ["nexiumab"])
    assert out["stages"][0]["comparisons"][0]["relationship"] == \
        "duplicate_bibliographic_record"
    assert out["stages"][1]["flag"] == "DUPLICATE_REVIEW_REQUIRED"


def test_spontaneous_icsr_workflow_end_to_end():
    suite = _suite()
    case = ICSR(
        worldwide_unique_id="FR-ACME-2024-000111",
        sender_case_id="ACME-111", sender_organization="ACME Pharma",
        country_of_occurrence="FR", receipt_date=date(2024, 5, 10),
        patient=PatientInfo(age_value=54, sex=Sex.MALE),
        reporters=[ReporterInfo(qualification="physician", country="FR")],
        drugs=[DrugExposure(name="nexiumab", role="suspect",
                            indication="rheumatoid arthritis", dose="200 mg",
                            start_date=date(2024, 4, 12))],
        events=[AdverseEvent(verbatim="hepatitis", onset_date=date(2024, 5, 3),
                             outcome_e2b="1", serious=True,
                             seriousness_criteria=["hospitalization"])],
        narrative=("54-year-old man developed hepatitis three weeks after starting "
                   "nexiumab. Nexiumab was discontinued and the hepatitis resolved "
                   "within 5 days of withdrawal. The patient was not rechallenged."),
        medical_history_text="Past medical history: hypertension.")
    existing = [ICSR(**{**case.model_dump(mode="json"),
                        "case_id": "CASE-existing",
                        "worldwide_unique_id": "FR-ACME-2024-000111",
                        "version": 1})]
    out = spontaneous_icsr_workflow(suite, case.model_copy(update={"version": 2}), existing)
    stages = {s["stage"]: s for s in out["stages"]}
    assert stages["case_duplicate_check"]["conclusion"]["classification"] == "follow_up_to_existing_icsr"
    assert stages["action_taken"]["actions"][0]["e2b_gk8"] == "1"
    assert stages["dechallenge"]["drug_event_pairs"][0]["dechallenge"] == "positive"
    assert stages["rechallenge"]["drug_event_pairs"][0]["e2b_gk9i4"] == "4"
    assert out["handoff"] == "qc_medical_review"


def test_followup_icsr_workflow_matches_and_reassesses():
    suite = _suite()
    existing = [ICSR(case_id="CASE-1", worldwide_unique_id="US-X-1",
                     sender_case_id="X-1", sender_organization="X Pharma",
                     patient=PatientInfo(age_value=60, sex=Sex.FEMALE),
                     reporters=[ReporterInfo(qualification="physician")],
                     drugs=[DrugExposure(name="nexiumab", role="suspect")],
                     events=[AdverseEvent(verbatim="rash")],
                     version=1)]
    new_info = ICSR(worldwide_unique_id="US-X-1", version=2,
                    sender_case_id="X-1", sender_organization="X Pharma",
                    patient=PatientInfo(age_value=60, sex=Sex.FEMALE),
                    reporters=[ReporterInfo(qualification="physician")],
                    drugs=[DrugExposure(name="nexiumab", role="suspect")],
                    events=[AdverseEvent(verbatim="rash", outcome_e2b="1")],
                    narrative="Follow-up: nexiumab was discontinued; rash resolved.")
    out = followup_icsr_workflow(suite, new_info, existing)
    assert out["handoff"] == "case_versioning_and_medical_review"
    assert out["stages"][1]["new_version"] == 2
    assert out["stages"][2]["action_taken"]["actions"][0]["e2b_gk8"] == "1"


def test_orchestration_contracts_and_adapter():
    suite = _suite()
    v = suite.versions()
    assert len(v) == 8 and all(vv == "1.0.0" for vv in v.values())
    assert "nodes" in LangGraphAdapter.describe()
