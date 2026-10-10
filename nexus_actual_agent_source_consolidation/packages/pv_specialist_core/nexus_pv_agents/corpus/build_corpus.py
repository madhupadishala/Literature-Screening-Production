"""Phase 5 — Controlled validation corpus builder.

Generates a stratified, labeled corpus for benchmarking. Sources are
synthetic and E2B(R3)-patterned (structure consistent with the ICH ICSR
reference examples); NO case is presented as expert-verified clinical ground
truth — labels are scenario-design labels, documented as such.
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from nexus_agents.schemas import (AdverseEvent, DrugExposure, ICSR,
                                  LiteratureArticle, PatientInfo, ReporterInfo,
                                  Sex)


def case(**kw) -> ICSR:
    return ICSR(**kw)


def build() -> dict:
    corpus: dict = {"label_basis": "scenario-design labels (not expert-adjudicated ground truth)",
                    "literature_pairs": [], "icsr_pairs": [], "screening": [],
                    "action_taken": [], "dechallenge": [], "rechallenge": [],
                    "medical_history": [], "followup": []}

    # ---------------- Agent 1: literature duplicate pairs
    lp = corpus["literature_pairs"]
    base_art = dict(title="Severe cutaneous reaction associated with nexiumab: a case report",
                    authors=["Smith J", "Doe A", "Lee K"], journal="J Clin Pharmacol",
                    year=2024, described_patients=["54-year-old man"], patient_count=1)
    lp.append({"label": "duplicate_bibliographic_record",
               "a": LiteratureArticle(pmid="38001122", doi="10.1000/xyz.123", **base_art).model_dump(),
               "b": LiteratureArticle(pmid="38001122", doi="https://doi.org/10.1000/xyz.123.",
                                      source_database="Embase", **base_art).model_dump()})
    lp.append({"label": "duplicate_bibliographic_record",
               "a": LiteratureArticle(doi="10.1000/abc.9", **base_art).model_dump(),
               "b": LiteratureArticle(doi="10.1000/ABC.9;", **base_art).model_dump()})
    lp.append({"label": "duplicate_publication_content",
               "a": LiteratureArticle(doi="10.1101/pre.55", publication_types=["Preprint"],
                                      journal="medRxiv", **{k: v for k, v in base_art.items() if k != "journal"}).model_dump(),
               "b": LiteratureArticle(doi="10.1000/final.55", journal="J Clin Pharmacol",
                                      **{k: v for k, v in base_art.items() if k != "journal"}).model_dump()})
    lp.append({"label": "new_independent_case",
               "a": LiteratureArticle(pmid="1", doi="10.1/a",
                                      title="Nexiumab-induced hepatitis in a 54-year-old man",
                                      authors=["Smith J"], year=2024,
                                      described_patients=["54-year-old man"]).model_dump(),
               "b": LiteratureArticle(pmid="2", doi="10.2/b",
                                      title="Pharmacokinetics of nexiumab in healthy volunteers",
                                      authors=["Garcia M"], year=2023,
                                      described_patients=[]).model_dump()})
    lp.append({"label": "overlapping_patient_case",
               "a": LiteratureArticle(pmid="3", doi="10.1/c",
                                      title="Immune-mediated colitis during nexiumab therapy",
                                      authors=["Smith J", "Doe A"], year=2024,
                                      described_patients=["61-year-old woman"]).model_dump(),
               "b": LiteratureArticle(pmid="4", doi="10.2/d",
                                      title="Successful retreatment after nexiumab colitis",
                                      authors=["Smith J", "Lee K"], year=2025,
                                      described_patients=["61-year-old woman"]).model_dump()})

    # ---------------- Agent 2: ICSR duplicate pairs
    icp = corpus["icsr_pairs"]
    base_icsr = dict(
        worldwide_unique_id="FR-ACME-2024-000111", sender_case_id="ACME-111",
        sender_organization="ACME Pharma", country_of_occurrence="FR",
        patient=PatientInfo(age_value=54, sex=Sex.MALE),
        reporters=[ReporterInfo(qualification="physician", country="FR",
                                organization="Lyon General")],
        drugs=[DrugExposure(name="nexiumab", role="suspect")],
        events=[AdverseEvent(verbatim="hepatitis", onset_date=date(2024, 5, 3))],
        narrative="54-year-old man developed hepatitis three weeks after starting nexiumab.")
    icp.append({"label": "exact_duplicate",
                "a": ICSR(**base_icsr).model_dump(mode="json"),
                "b": ICSR(**{**base_icsr, "sender_case_id": "ACME-111"}).model_dump(mode="json")})
    followup = dict(base_icsr, version=2, narrative=base_icsr["narrative"] + " Follow-up: recovered.")
    icp.append({"label": "follow_up_to_existing_icsr",
                "a": ICSR(**base_icsr).model_dump(mode="json"),
                "b": ICSR(**followup).model_dump(mode="json")})
    dup2 = dict(base_icsr, worldwide_unique_id=None, sender_case_id="HOSP-998",
                sender_organization="Lyon General")
    icp.append({"label": "probable_duplicate",   # different IDs, all clinical fields match
                "a": ICSR(**base_icsr).model_dump(mode="json"),
                "b": ICSR(**dup2).model_dump(mode="json")})
    distinct = dict(base_icsr, worldwide_unique_id=None, sender_case_id=None,
                    patient=PatientInfo(age_value=23, sex=Sex.FEMALE),
                    country_of_occurrence="DE",
                    events=[AdverseEvent(verbatim="nausea", onset_date=date(2024, 9, 1))],
                    reporters=[ReporterInfo(qualification="consumer", country="DE")],
                    narrative="23-year-old woman reported nausea while taking nexiumab.")
    icp.append({"label": "new_case",
                "a": ICSR(**base_icsr).model_dump(mode="json"),
                "b": ICSR(**distinct).model_dump(mode="json")})
    sex_conflict = dict(base_icsr, worldwide_unique_id=None, sender_case_id=None,
                        patient=PatientInfo(age_value=54, sex=Sex.FEMALE))
    icp.append({"label": "related_but_distinct_case",
                "a": ICSR(**base_icsr).model_dump(mode="json"),
                "b": ICSR(**sex_conflict).model_dump(mode="json")})
    sparse = dict(base_icsr, worldwide_unique_id=None, sender_case_id=None,
                  patient=PatientInfo(), reporters=[],
                  events=[AdverseEvent(verbatim="rash")],
                  drugs=[DrugExposure(name="nexiumab", role="suspect")],
                  narrative="", country_of_occurrence=None)
    icp.append({"label": "unresolved",   # evidence-sparse: must not be forced
                "a": ICSR(**base_icsr).model_dump(mode="json"),
                "b": ICSR(**sparse).model_dump(mode="json")})

    # ---------------- Agent 4: literature screening
    sc = corpus["screening"]
    sc.append({"label": "INCLUDE",
               "article": LiteratureArticle(
                   title="Nexiumab-associated anaphylaxis: a case report",
                   abstract="We report a 54-year-old man who developed anaphylaxis after the "
                            "second infusion of nexiumab. The reaction resolved after withdrawal.",
                   publication_types=["Case Reports"], patient_count=1,
                   described_patients=["54-year-old man"], has_full_text=True).model_dump(),
               "product_scope": ["nexiumab"]})
    sc.append({"label": "EXCLUDE",
               "article": LiteratureArticle(
                   title="Advances in monoclonal antibody engineering",
                   abstract="A technical overview of antibody engineering platforms and "
                            "manufacturing improvements.", publication_types=["Review"]).model_dump(),
               "product_scope": ["nexiumab"]})
    sc.append({"label": "FULL_TEXT_REQUIRED",
               "article": LiteratureArticle(
                   title="Unexpected hepatic injury in a patient receiving nexiumab",
                   abstract="We report a case of hepatotoxicity temporally associated with "
                            "nexiumab in a 47-year-old woman.",
                   publication_types=["Case Reports"], patient_count=1,
                   has_full_text=False).model_dump(),
               "product_scope": ["nexiumab"]})
    sc.append({"label": "MEDICAL_REVIEW_REQUIRED",
               "article": LiteratureArticle(
                   title="Severe skin reaction with competitor drug zalutumab",
                   abstract="A case report of Stevens-Johnson syndrome in a patient treated "
                            "with zalutumab, a drug in the same class.",
                   publication_types=["Case Reports"], patient_count=1,
                   has_full_text=True).model_dump(),
               "product_scope": ["nexiumab"]})
    sc.append({"label": "DUPLICATE_REVIEW_REQUIRED",
               "article": LiteratureArticle(
                   title="Nexiumab-associated anaphylaxis: a case report",
                   abstract="We report a 54-year-old man who developed anaphylaxis.",
                   publication_types=["Case Reports"], patient_count=1).model_dump(),
               "product_scope": ["nexiumab"], "duplicate_suspected": True})
    sc.append({"label": "EXCLUDE",
               "article": LiteratureArticle(
                   title="Systematic review of TNF inhibitor safety",
                   abstract="Pooled analysis of adverse reactions across five trials.",
                   publication_types=["Review"]).model_dump(),
               "product_scope": ["placebo-x"]})  # out of scope AND aggregate -> class-safety, not in scope, no case
    # NOTE: per GVP IX signal relevance, reviews WITH safety content but out of
    # scope and no identifiable case are EXCLUDE with explicit reason codes —
    # the signal relevance is retained in the dimensions.

    # ---------------- Agent 5: action taken
    at = corpus["action_taken"]
    def at_case(narrative, drug="nexiumab"):
        return ICSR(drugs=[DrugExposure(name=drug, role="suspect")],
                    events=[AdverseEvent(verbatim="event")], narrative=narrative).model_dump(mode="json")
    at.append({"label": "1", "case": at_case("The patient developed a rash. Nexiumab was discontinued.")})
    at.append({"label": "2", "case": at_case("The dose of nexiumab was reduced to 100 mg after the event.")})
    at.append({"label": "3", "case": at_case("Nexiumab dose was increased to manage the underlying disease.")})
    at.append({"label": "4", "case": at_case("Nexiumab was continued at the same dose.")})
    at.append({"label": "0", "case": at_case("The patient reported nausea last week.")})
    at.append({"label": "9", "case": at_case("The patient had completed the course of nexiumab prior to the event.")})
    at.append({"label": "1", "case": at_case("Nexiumab was temporarily held and later restarted."),
               "expect_raw": "temporary_interruption"})
    at.append({"label": "1", "case": at_case("Nexiumab was withdrawn and restarted after recovery.")})

    # ---------------- Agent 6: dechallenge
    dc = corpus["dechallenge"]
    def dc_case(narrative, outcome=None):
        return ICSR(drugs=[DrugExposure(name="nexiumab", role="suspect")],
                    events=[AdverseEvent(verbatim="rash", outcome_e2b=outcome)],
                    narrative=narrative).model_dump(mode="json")
    dc.append({"label": "positive", "case": dc_case(
        "Nexiumab was discontinued. The rash resolved within 5 days of withdrawal.", outcome="1")})
    dc.append({"label": "negative", "case": dc_case(
        "Nexiumab was discontinued. The rash did not improve and persisted.", outcome="3")})
    dc.append({"label": "unresolved", "case": dc_case(
        "Nexiumab was discontinued. The patient was discharged.")})
    dc.append({"label": "not_assessable", "case": dc_case(
        "Nexiumab was continued at the same dose. The rash improved.", outcome="1")})
    dc.append({"label": "confounded", "case": dc_case(
        "Nexiumab was discontinued and corticosteroids were started. The rash resolved.",
        outcome="1")})

    # ---------------- Agent 7: rechallenge
    rc = corpus["rechallenge"]
    def rc_case(narrative):
        return ICSR(drugs=[DrugExposure(name="nexiumab", role="suspect")],
                    events=[AdverseEvent(verbatim="hepatitis")],
                    narrative=narrative).model_dump(mode="json")
    rc.append({"label": "positive", "case": rc_case(
        "Nexiumab was discontinued and the hepatitis resolved. Nexiumab was restarted and "
        "the hepatitis recurred within 3 days.")})
    rc.append({"label": "negative", "case": rc_case(
        "Nexiumab was withdrawn, then restarted after recovery; the event did not recur.")})
    rc.append({"label": "unresolved", "case": rc_case(
        "Nexiumab was withdrawn and later reintroduced; the subsequent course was not documented.")})
    rc.append({"label": "not_rechallenged", "case": rc_case(
        "Nexiumab was discontinued. The patient was not rechallenged.")})
    rc.append({"label": "not_rechallenged", "case": rc_case(
        "Nexiumab was continued throughout without interruption; the hepatitis persisted.")})
    rc.append({"label": "positive", "case": rc_case(
        "After inadvertent re-exposure to nexiumab, the hepatitis recurred."),
        "expect_note": "accidental"})

    # ---------------- Agent 8: medical history
    mh = corpus["medical_history"]
    def mh_case(hist, narrative=""):
        return ICSR(drugs=[DrugExposure(name="nexiumab", role="suspect",
                                        indication="rheumatoid arthritis")],
                    events=[AdverseEvent(verbatim="rash")],
                    medical_history_text=hist, narrative=narrative).model_dump(mode="json")
    mh.append({"label": "standard", "case": mh_case(
        "Past medical history: hypertension and type 2 diabetes. No history of epilepsy. "
        "Allergy to penicillin. Family history of stroke. Currently on treatment for "
        "hyperlipidaemia."),
        "expect": {"negated_contains": "epilepsy", "allergy_contains": "penicillin",
                   "family_contains": "stroke", "current_contains": "hyperlipidaemia",
                   "coded_contains": "PLACEHOLDER:Hypertension",
                   "indication": "rheumatoid arthritis"}})
    mh.append({"label": "sparse", "case": mh_case(""),
        "expect": {"no_items_from_narrative_without_history": True}})

    # ---------------- Agent 3: follow-up
    fu = corpus["followup"]
    fu.append({"label": "missing_minimum", "case": ICSR(
        events=[AdverseEvent(verbatim="rash")]).model_dump(mode="json"),
        "expect_gaps": ["suspect_product", "identifiable_patient", "identifiable_reporter"]})
    fu.append({"label": "serious_priorities", "case": ICSR(
        patient=PatientInfo(age_value=40, sex=Sex.FEMALE),
        reporters=[ReporterInfo(qualification="physician")],
        drugs=[DrugExposure(name="nexiumab", role="suspect")],
        events=[AdverseEvent(verbatim="anaphylaxis", serious=True)],
        narrative="Severe anaphylaxis after second dose.").model_dump(mode="json"),
        "expect_gaps": ["onset_date", "outcome", "seriousness", "dechallenge", "pregnancy"]})
    fu.append({"label": "complete_case_no_questions", "case": ICSR(
        patient=PatientInfo(age_value=60, sex=Sex.MALE),
        reporters=[ReporterInfo(qualification="pharmacist")],
        drugs=[DrugExposure(name="nexiumab", role="suspect", indication="RA",
                            dose="200 mg", start_date=date(2024, 1, 5),
                            action_taken_e2b="1")],
        events=[AdverseEvent(verbatim="rash", onset_date=date(2024, 2, 1),
                             outcome_e2b="1", serious=False)],
        narrative="Rash resolved after withdrawal.",
        medical_history_text="Past medical history: hypertension.").model_dump(mode="json"),
        "expect_gaps_absent": ["suspect_product", "onset_date", "outcome", "action_taken",
                               "indication", "medical_history"]})

    # ---------------- ADVERSARIAL HOLD-OUT (built after agent freeze; agents
    # were NOT tuned against these; misses are reported, not hidden)
    corpus["adversarial"] = {
        "action_taken": [
            {"label": "1", "case": at_case("She was taken off nexiumab."),
             "note": "colloquial withdrawal phrasing"},
            {"label": "1", "case": at_case(
                "Nexiumab was withheld prior to surgery; the rash had started the week before."),
             "note": "procedure-withholding with prior event onset"},
        ],
        "dechallenge": [
            {"label": "confounded", "case": dc_case(
                "Nexiumab was stopped; the hepatitis resolved after plasmapheresis.",
                outcome="1"), "note": "unlisted confounding intervention"},
        ],
        "rechallenge": [
            {"label": "positive", "case": rc_case(
                "On reintroduction of nexiumab, liver enzymes rose again."),
             "note": "recurrence expressed as objective finding, not the word 'recurred'"},
        ],
        "literature_pairs": [
            {"label": "duplicate_bibliographic_record",
             "note": "translated title, same DOI — deterministic identifiers must win",
             "a": LiteratureArticle(pmid="991", doi="10.1000/trans.7",
                                    title="Réaction cutanée sévère associée au nexiumab",
                                    authors=["Smith J"], journal="Rev Fr Dermatol",
                                    year=2024, language="fr").model_dump(),
             "b": LiteratureArticle(pmid="992", doi="10.1000/trans.7",
                                    title="Severe cutaneous reaction associated with nexiumab",
                                    authors=["Smith J"], journal="J Clin Pharmacol",
                                    year=2024, language="en").model_dump()},
        ],
        "screening": [
            {"label": "UNRESOLVED",
             "note": "correction notice mentioning an adverse event but containing no case",
             "article": LiteratureArticle(
                 title="Correction to: nexiumab trial safety results",
                 abstract="Erratum: adverse event numbers in the previously published "
                          "trial report were misstated.",
                 publication_types=["Correction"]).model_dump(),
             "product_scope": ["nexiumab"]},
        ],
    }

    out = Path(__file__).resolve().parent / "corpus.json"
    out.write_text(json.dumps(corpus, indent=2, default=str), encoding="utf-8")
    counts = {k: (len(v) if isinstance(v, list) else "-") for k, v in corpus.items()}
    print("corpus written:", out, counts)
    return corpus


if __name__ == "__main__":
    build()
