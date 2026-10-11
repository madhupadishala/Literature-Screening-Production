"""Engineering tests: unit, schema, and corpus-driven assertions (Phase 6)."""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from nexus_agents.agents import (ActionTakenAgent, DechallengeAgent,
                                 FollowUpQuestionnaireAgent,
                                 InclusionExclusionAgent, IcsrDuplicateAgent,
                                 LiteratureDuplicateAgent, MedicalHistoryAgent,
                                 RechallengeAgent)
from nexus_agents.knowledge_register import KnowledgeRegister
from nexus_agents.schemas import (AdverseEvent, DrugExposure, ICSR,
                                  LiteratureArticle, PatientInfo, ReporterInfo,
                                  ResultStatus, Sex)
from nexus_agents.textnorm import normalize_doi, normalize_pmid

CORPUS = json.loads((ROOT / "corpus" / "corpus.json").read_text())


def _icsr(d):  return ICSR(**d)
def _art(d):   return LiteratureArticle(**d)


# ------------------------------------------------------------------ textnorm
def test_doi_normalization():
    assert normalize_doi("https://doi.org/10.1000/XYZ.123.") == "10.1000/xyz.123"
    assert normalize_doi("DOI: 10.1/AbC;") == "10.1/abc"
    assert normalize_doi(None) is None


def test_pmid_normalization():
    assert normalize_pmid("PMID: 38001122") == "38001122"
    assert normalize_pmid(" 38001122 ") == "38001122"


# ----------------------------------------------------- knowledge register
def test_register_gate_blocks_unapproved():
    reg = KnowledgeRegister()
    assert reg.approved("REQ-EU-GVPVI-ADD1-DUP")
    assert not reg.approved("REQ-MEDDRA-29.0")  # license-blocked, not usable
    try:
        reg.require_approved(["REQ-MEDDRA-29.0"])
        raise AssertionError("gate should have raised")
    except PermissionError:
        pass


# ----------------------------------------------------------- Agent 1 (lit)
def test_lit_corpus_labels():
    agent = LiteratureDuplicateAgent()
    for item in CORPUS["literature_pairs"]:
        res = agent.assess_pair(_art(item["a"]), _art(item["b"]))
        assert res.payload["relationship"] == item["label"], \
            f"expected {item['label']}, got {res.payload['relationship']}"


def test_lit_never_auto_discards_potential_new_info():
    agent = LiteratureDuplicateAgent()
    item = CORPUS["literature_pairs"][4]  # overlapping patient case
    res = agent.assess_pair(_art(item["a"]), _art(item["b"]))
    assert res.payload["eligible_for_auto_exclusion"] is False
    assert res.payload["manual_review"] is True


def test_lit_followup_to_existing_icsr():
    agent = LiteratureDuplicateAgent()
    a = _art(CORPUS["literature_pairs"][0]["a"])
    res = agent.assess_pair(a, a.model_copy(update={"record_id": "LIT-x"}),
                            known_icsr_case_ids={"38001122": ["CASE-9"]})
    assert res.payload["relationship"] in (
        "duplicate_bibliographic_record", "followup_to_existing_icsr")


# ----------------------------------------------------------- Agent 2 (ICSR)
def test_icsr_corpus_labels():
    agent = IcsrDuplicateAgent()
    for item in CORPUS["icsr_pairs"]:
        res = agent.compare(_icsr(item["a"]), _icsr(item["b"]))
        assert res.payload["classification"] == item["label"], \
            f"expected {item['label']}, got {res.payload['classification']} " \
            f"(score {res.payload['matching_score']})"


def test_icsr_sex_contradiction_blocks_merge():
    agent = IcsrDuplicateAgent()
    item = CORPUS["icsr_pairs"][4]
    res = agent.compare(_icsr(item["a"]), _icsr(item["b"]))
    assert res.payload["merge_permitted"] is False


def test_icsr_sparse_case_unresolved_not_new():
    agent = IcsrDuplicateAgent()
    item = CORPUS["icsr_pairs"][5]
    res = agent.compare(_icsr(item["a"]), _icsr(item["b"]))
    assert res.payload["classification"] == "unresolved"
    assert res.status == ResultStatus.HUMAN_REVIEW_REQUIRED


def test_icsr_merge_reversible_auditable():
    agent = IcsrDuplicateAgent()
    a = _icsr(CORPUS["icsr_pairs"][0]["a"]); b = _icsr(CORPUS["icsr_pairs"][0]["b"])
    m = agent.merge(a, b)
    assert m.payload["reversible"] is True
    assert m.payload["c_1_9_1_record"] is not None
    assert "audit" in m.payload


# ------------------------------------------------------------- Agent 3 (FU)
def test_followup_missing_minimum_criteria():
    agent = FollowUpQuestionnaireAgent()
    item = CORPUS["followup"][0]
    res = agent.generate(_icsr(item["case"]))
    gaps = {q["gap"] for q in res.payload["questions"]}
    for g in item["expect_gaps"]:
        assert g in gaps, f"missing gap {g}"


def test_followup_serious_priorities_and_pregnancy():
    agent = FollowUpQuestionnaireAgent()
    item = CORPUS["followup"][1]
    res = agent.generate(_icsr(item["case"]))
    gaps = {q["gap"] for q in res.payload["questions"]}
    for g in item["expect_gaps"]:
        assert g in gaps, f"missing gap {g}"
    assert res.payload["approval_required_before_send"] is True


def test_followup_no_redundant_questions():
    agent = FollowUpQuestionnaireAgent()
    item = CORPUS["followup"][2]
    res = agent.generate(_icsr(item["case"]))
    gaps = {q["gap"] for q in res.payload["questions"]}
    for g in item["expect_gaps_absent"]:
        assert g not in gaps, f"should not ask about documented field {g}"


def test_followup_contradiction_detected():
    agent = FollowUpQuestionnaireAgent()
    case = ICSR(
        patient=PatientInfo(age_value=50, sex=Sex.MALE),
        reporters=[ReporterInfo(qualification="physician")],
        drugs=[DrugExposure(name="nexiumab", role="suspect", start_date=date(2024, 5, 1))],
        events=[AdverseEvent(verbatim="rash", onset_date=date(2024, 4, 1), serious=False)],
        narrative="Rash.",
        medical_history_text="none")
    res = agent.generate(case)
    assert res.payload["contradictions"], "onset-before-treatment-start not flagged"


# -------------------------------------------------------- Agent 4 (screen)
def test_screening_corpus_labels():
    agent = InclusionExclusionAgent()
    for item in CORPUS["screening"]:
        res = agent.screen(_art(item["article"]), item["product_scope"],
                           duplicate_suspected=item.get("duplicate_suspected", False))
        assert res.payload["flag"] == item["label"], \
            f"expected {item['label']}, got {res.payload['flag']} ({res.payload['reason_codes']})"


def test_screening_reason_codes_controlled():
    agent = InclusionExclusionAgent()
    res = agent.screen(_art(CORPUS["screening"][0]["article"]), ["nexiumab"])
    assert res.payload["reason_codes"], "flag without reason codes"
    assert res.payload["evidence_level"] == "full_text"


def test_screening_non_company_product_not_auto_excluded_when_case():
    agent = InclusionExclusionAgent()
    res = agent.screen(_art(CORPUS["screening"][3]["article"]), ["nexiumab"])
    assert res.payload["flag"] == "MEDICAL_REVIEW_REQUIRED"
    assert "NON_COMPANY_PRODUCT_WITH_SAFETY_INFO" in res.payload["reason_codes"]


# ------------------------------------------------------ Agent 5 (action)
def test_action_taken_corpus_labels():
    agent = ActionTakenAgent()
    for item in CORPUS["action_taken"]:
        res = agent.extract(_icsr(item["case"]))
        got = res.payload["actions"][0]
        assert got["e2b_gk8"] == item["label"], \
            f"expected G.k.8={item['label']}, got {got} for: {item['case']['narrative']}"
        if "expect_raw" in item:
            assert got["normalized_action"] == item["expect_raw"]


def test_action_taken_na_requires_precondition():
    agent = ActionTakenAgent()
    # plain discontinuation must NOT be coded 9
    res = agent.extract(ICSR(
        drugs=[DrugExposure(name="nexiumab", role="suspect")],
        events=[AdverseEvent(verbatim="rash")],
        narrative="Nexiumab was discontinued because of the rash."))
    assert res.payload["actions"][0]["e2b_gk8"] == "1"


def test_action_taken_fields_separate():
    agent = ActionTakenAgent()
    res = agent.extract(_icsr(CORPUS["action_taken"][6]["case"]))
    a = res.payload["actions"][0]
    assert a["raw_action"] and a["normalized_action"] == "temporary_interruption"
    assert a["e2b_gk8"] == "1"  # coded withdrawn; raw preserved


# ---------------------------------------------------- Agent 6 (dechallenge)
def test_dechallenge_corpus_labels():
    agent = DechallengeAgent()
    for item in CORPUS["dechallenge"]:
        res = agent.assess(_icsr(item["case"]))
        got = res.payload["drug_event_pairs"][0]["dechallenge"]
        assert got == item["label"], \
            f"expected {item['label']}, got {got} for: {item['case']['narrative']}"


def test_dechallenge_withdrawal_alone_not_positive():
    agent = DechallengeAgent()
    res = agent.assess(_icsr(CORPUS["dechallenge"][2]["case"]))
    pair = res.payload["drug_event_pairs"][0]
    assert pair["dechallenge"] == "unknown"
    assert "causality" in pair["causality_disclaimer"]


# ---------------------------------------------------- Agent 7 (rechallenge)
def test_rechallenge_corpus_labels():
    agent = RechallengeAgent()
    for item in CORPUS["rechallenge"]:
        res = agent.assess(_icsr(item["case"]))
        pair = res.payload["drug_event_pairs"][0]
        assert pair["rechallenge"] == item["label"], \
            f"expected {item['label']}, got {pair['rechallenge']} for: {item['case']['narrative']}"
        if "expect_note" in item:
            assert item["expect_note"] in (pair["note"] or "")


def test_rechallenge_e2b_mapping():
    agent = RechallengeAgent()
    res = agent.assess(_icsr(CORPUS["rechallenge"][0]["case"]))
    assert res.payload["drug_event_pairs"][0]["e2b_gk9i4"] == "1"
    res = agent.assess(_icsr(CORPUS["rechallenge"][3]["case"]))
    assert res.payload["drug_event_pairs"][0]["e2b_gk9i4"] == "4"


def test_rechallenge_never_suggests_performing_one():
    agent = RechallengeAgent()
    for item in CORPUS["rechallenge"]:
        res = agent.assess(_icsr(item["case"]))
        assert "never" in res.payload["guardrail"].lower()


# ---------------------------------------------------- Agent 8 (med history)
def test_med_history_distinctions():
    agent = MedicalHistoryAgent()
    item = CORPUS["medical_history"][0]
    res = agent.extract(_icsr(item["case"]))
    items = res.payload["history_items"]
    verbatims = {i["verbatim"].lower() for i in items}
    joined = " | ".join(verbatims)
    exp = item["expect"]
    assert any(exp["negated_contains"] in v for v in
               {i["verbatim"].lower() for i in items if i["negated"]}), "negation lost"
    assert any(exp["allergy_contains"] in i["verbatim"].lower()
               for i in items if i["category"] == "allergies")
    assert any(exp["family_contains"] in i["verbatim"].lower()
               for i in items if i["subject"] == "family")
    assert any(exp["current_contains"] in i["verbatim"].lower()
               for i in items if i["temporality"] == "current")
    assert any(i["coded_term"] == exp["coded_contains"] for i in items)
    assert res.payload["indications_preserved"][0]["indication"] == exp["indication"]


def test_med_history_cap_scope_enforced():
    try:
        MedicalHistoryAgent(cap_fields=("undocumented_field",))
        raise AssertionError("should have refused undocumented CAP attribute")
    except ValueError:
        pass


def test_med_history_uncoded_flagged_not_invented():
    agent = MedicalHistoryAgent()
    case = ICSR(drugs=[DrugExposure(name="x", role="suspect")],
                events=[AdverseEvent(verbatim="rash")],
                medical_history_text="History of Zimmerman-Laband syndrome.")
    res = agent.extract(case)
    assert any(i["coding_status"] == "UNCODED" for i in res.payload["history_items"])
    assert res.status == ResultStatus.UNRESOLVED


# ------------------------------------------------------------ failure modes
def test_processing_failure_never_false_negative():
    agent = ActionTakenAgent()
    res = agent.extract(ICSR())  # empty case
    assert res.status in (ResultStatus.CONFIRMED, ResultStatus.UNRESOLVED,
                          ResultStatus.PROCESSING_FAILURE)
    # no crash, no fabricated action
    for a in res.payload["actions"]:
        assert a["e2b_gk8"] in ("0", "1", "2", "3", "4", "9")
