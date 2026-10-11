"""AGENT 3 — Follow-up Questionnaire AI.

Generates case-specific, non-leading questions for missing or contradictory
information, prioritised by clinical significance, minimum ICSR criteria,
seriousness, urgency, and materiality. Never asks for what is already
documented. Outbound communication requires authorised reviewer approval.
"""
from __future__ import annotations

from ..schemas import ICSR, ResultStatus
from .base import BaseAgent

# (gap_id, field, neutral question, base_priority, rationale)
_QUESTION_BANK = [
    ("suspect_product", "suspect_product",
     "Which medicinal product is suspected to have caused the reported reaction? Please provide the name, formulation and strength.",
     100, "Minimum ICSR criterion missing (suspect product)."),
    ("adverse_reaction", "adverse_reaction",
     "What adverse reaction did the patient experience? Please describe the signs, symptoms or diagnosis.",
     100, "Minimum ICSR criterion missing (adverse reaction)."),
    ("identifiable_patient", "patient",
     "Can you provide any patient identifier such as initials, age, or sex, that would allow this patient to be distinguished from others?",
     95, "Minimum ICSR criterion missing (identifiable patient)."),
    ("identifiable_reporter", "reporter",
     "Could you confirm your name or qualification and country so that we may contact you if needed?",
     95, "Minimum ICSR criterion missing (identifiable reporter)."),
    ("onset_date", "event_onset",
     "On what date did the patient first experience the reaction?",
     80, "Event onset date needed for temporal association assessment."),
    ("outcome", "event_outcome",
     "What was the outcome of the reported event at the time of last observation?",
     75, "Outcome required for seriousness and dechallenge assessment."),
    ("action_taken", "action_taken",
     "Was the suspected medication stopped, or was its dosage changed, after the event occurred?",
     78, "Action taken with drug required for E2B G.k.8 and dechallenge."),
    ("dechallenge", "dechallenge",
     "What happened to the reported symptoms after the medication was discontinued?",
     72, "Clinical course after withdrawal needed for dechallenge."),
    ("rechallenge", "rechallenge",
     "Was the medication restarted after the event, and if so, did the event recur?",
     72, "Re-administration and recurrence needed for rechallenge assessment."),
    ("indication", "indication",
     "For which condition was the suspected medication prescribed?",
     55, "Indication distinguishes treatment context from adverse event."),
    ("dose_duration", "dose_duration",
     "What dose was the patient taking, and over what period?",
     58, "Dose and exposure duration needed for dose-response assessment."),
    ("concomitant", "concomitant_medication",
     "Which other medicines, including over-the-counter products and supplements, was the patient taking at the time?",
     62, "Concomitant medication needed to evaluate alternative causes."),
    ("medical_history", "medical_history",
     "Does the patient have any relevant past or ongoing medical conditions?",
     60, "Medical history needed to evaluate confounding and risk factors."),
    ("labs", "laboratory",
     "Were any laboratory tests or investigations performed in relation to the event? If so, please provide the results and dates.",
     65, "Objective investigation results materially affect medical assessment."),
    ("seriousness", "seriousness",
     "Did the event result in death, a life-threatening condition, hospitalisation or its prolongation, persistent disability, or any other medically important condition?",
     85, "Seriousness criteria determine expedited reporting obligations."),
    ("hospitalization", "hospitalization",
     "Was the patient hospitalised because of the event? If so, what were the admission and discharge dates?",
     70, "Hospitalisation details support seriousness classification."),
    ("pregnancy", "pregnancy",
     "Was the patient pregnant or breastfeeding at the time of the event? If so, please provide gestational age.",
     66, "Pregnancy/breastfeeding exposure is a special reporting situation."),
]

# contradictions checked explicitly (field, detector note)
class FollowUpQuestionnaireAgent(BaseAgent):
    NAME = "followup_questionnaire"
    VERSION = "1.0.0"
    REQUIRED_RULES = ["REQ-EU-GVPVI-VALID-ICSR", "REQ-ICH-E2D-R1-FOLLOWUP",
                      "REQ-EU-GVPVI-TIMEFRAMES", "REQ-EU-GVPVI-ADD2-PRIVACY"]

    def generate(self, case: ICSR, already_attempted: list[str] | None = None) -> dict:
        return self.safe_run(self._generate, case, already_attempted or [])

    def _generate(self, case: ICSR, already_attempted: list[str]):
        gaps: set[str] = set(case.missing_minimum_criteria())
        serious = any(e.serious for e in case.events)
        contradictions: list[str] = []

        # ---- field-level gap detection (skip anything already documented)
        if any(not e.onset_date for e in case.events):
            gaps.add("onset_date")
        if any(not e.outcome_e2b for e in case.events):
            gaps.add("outcome")
        if any(d.role == "suspect" and not d.action_taken_e2b and not d.action_taken_raw
               for d in case.drugs):
            gaps.add("action_taken")
        if any(d.role == "suspect" and not d.indication for d in case.drugs):
            gaps.add("indication")
        if any(d.role == "suspect" and (not d.dose or (not d.start_date and not d.end_date))
               for d in case.drugs):
            gaps.add("dose_duration")
        if not any(d.role == "concomitant" for d in case.drugs):
            gaps.add("concomitant")
        if not case.medical_history_text.strip():
            gaps.add("medical_history")
        if any(e.serious is None for e in case.events) or \
                any(e.serious and not e.seriousness_criteria for e in case.events):
            gaps.add("seriousness")
        if serious:
            gaps.update({"labs", "dechallenge", "rechallenge", "hospitalization"})
        if case.patient.sex.value == "F" and case.patient.age_value and 12 <= case.patient.age_value <= 55:
            gaps.add("pregnancy")

        # ---- contradiction detection
        for d in case.drugs:
            for e in case.events:
                if d.start_date and e.onset_date and e.onset_date < d.start_date:
                    contradictions.append(
                        f"event '{e.verbatim}' onset ({e.onset_date}) precedes start of "
                        f"suspect drug '{d.name}' ({d.start_date})")
        for e in case.events:
            if e.outcome_e2b in ("1", "2") and not e.end_date:
                contradictions.append(
                    f"event '{e.verbatim}' reported recovered but no resolution date given")

        # ---- dechallenge/rechallenge relevance
        if any((d.action_taken_e2b == "1") for d in case.drugs) and \
                all(not e.outcome_e2b for e in case.events):
            gaps.add("dechallenge")
        if "restart" in case.narrative.lower() or "resumed" in case.narrative.lower():
            gaps.discard("rechallenge")  # already addressed in narrative

        # ---- build prioritised questions
        questions = []
        for gap_id, field, text, base, rationale in _QUESTION_BANK:
            if gap_id not in gaps or gap_id in already_attempted:
                continue
            priority = base
            if serious and gap_id in ("onset_date", "outcome", "labs", "dechallenge",
                                      "rechallenge", "seriousness", "hospitalization"):
                priority += 10  # seriousness raises urgency
            if gap_id in contradictions_joined(contradictions):
                priority += 8
            questions.append({
                "question": text, "addresses_field": field, "gap": gap_id,
                "priority": priority, "rationale": rationale,
                "evidence_reviewed": self._evidence_summary(case, gap_id),
            })
        questions.sort(key=lambda q: -q["priority"])
        for c in contradictions:
            questions.insert(0, {
                "question": f"Our records contain conflicting information: {c}. Could you clarify the correct sequence and dates?",
                "addresses_field": "contradiction", "gap": "contradiction",
                "priority": 90, "rationale": "Contradictory information blocks medical assessment.",
                "evidence_reviewed": [c],
            })

        r = self.result(status=ResultStatus.HUMAN_REVIEW_REQUIRED)
        r.payload = {
            "case_id": case.case_id,
            "questions": questions,
            "contradictions": contradictions,
            "serious_case": serious,
            "minimum_criteria_complete": not case.missing_minimum_criteria(),
            "approval_required_before_send": True,
            "versioned": True,
        }
        if not questions:
            r.status = ResultStatus.CONFIRMED
            r.payload["note"] = "No unaddressed gaps; follow-up not indicated."
        return r

    @staticmethod
    def _evidence_summary(case: ICSR, gap: str) -> list[str]:
        ev = []
        if case.narrative:
            ev.append(f"narrative ({len(case.narrative)} chars) reviewed")
        ev.append(f"{len(case.drugs)} drug record(s), {len(case.events)} event(s) reviewed")
        return ev


def contradictions_joined(contradictions: list[str]) -> set[str]:
    tags = set()
    for c in contradictions:
        if "onset" in c:
            tags.add("onset_date")
        if "recovered" in c:
            tags.add("outcome")
    return tags
