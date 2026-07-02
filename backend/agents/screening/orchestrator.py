from datetime import datetime, timezone

from .rules import SPECIAL_SITUATIONS, SERIOUSNESS_TERMS, SEVERITY_TERMS, EXCLUSION_TERMS


def _text(article: dict, hits_output: dict | None = None) -> str:
    hits_output = hits_output or {}
    return " ".join(
        str(value or "")
        for value in [
            article.get("title"),
            article.get("abstract"),
            article.get("evidence_sentence"),
            article.get("journal"),
            hits_output.get("evidence_sentence"),
            hits_output.get("ai_reasoning"),
        ]
    ).lower()


def _as_list(value, fallback):
    if value is None:
        return fallback
    if isinstance(value, list):
        return value if value else fallback
    if isinstance(value, str):
        return [value] if value.strip() else fallback
    return fallback


def detect_special_situations(text: str):
    found = [term for term in SPECIAL_SITUATIONS if term in text]
    return found or ["None identified"]


def detect_seriousness(text: str):
    for term in SERIOUSNESS_TERMS:
        if term in text:
            return "Serious"
    return "Not mentioned"


def detect_severity(text: str):
    for severity, terms in SEVERITY_TERMS.items():
        if any(term in text for term in terms):
            return severity
    return "Not mentioned"


def detect_exclusion(text: str):
    return [term for term in EXCLUSION_TERMS if term in text]


def build_screening_output(article: dict, hits_output: dict) -> dict:
    text = _text(article, hits_output)

    company_suspects = _as_list(
        hits_output.get("company_suspect_drugs")
        or hits_output.get("matched_products")
        or hits_output.get("suspect_products"),
        ["Not identified"],
    )

    clinical_events = _as_list(
        hits_output.get("clinical_events")
        or hits_output.get("events")
        or hits_output.get("adverse_events"),
        ["Not identified"],
    )

    special_situations = detect_special_situations(text)
    seriousness = detect_seriousness(text)
    severity = detect_severity(text)
    exclusions = detect_exclusion(text)

    patient_safety = (
        "Yes"
        if clinical_events != ["Not identified"] or special_situations != ["None identified"]
        else "No"
    )

    pii = (
        "Yes"
        if hits_output.get("patient_identification") or hits_output.get("pii_detected")
        else "No"
    )

    active_mah = "Yes" if hits_output.get("mah_active") is True else "Unknown"
    coi = "Yes" if hits_output.get("country_of_interest") else "Uncertain"

    if exclusions and patient_safety == "No":
        decision = "Exclude"
    elif patient_safety == "Yes" and company_suspects != ["Not identified"]:
        decision = "Proceed to Intake"
    else:
        decision = "Manual Review Required"

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "screening_status": "ready",
        "intake_status": "pending",
        "company_suspect_drugs": company_suspects,
        "active_mah": active_mah,
        "co_suspect_drugs": _as_list(
            hits_output.get("co_suspect_drugs"),
            ["None identified"],
        ),
        "concomitant_medications": _as_list(
            hits_output.get("concomitant_medications"),
            ["Not reported"],
        ),
        "treatment_medications": _as_list(
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
            "Screening output generated using product detection, MAH/COI logic, "
            "patient identification, safety event detection, special situation rules, "
            "severity and seriousness checks."
        ),
        "exclusion_terms_detected": exclusions,
        "flags": build_flags(
            company_suspects,
            active_mah,
            coi,
            patient_safety,
            pii,
            clinical_events,
            special_situations,
            exclusions,
        ),
    }


def build_flags(
    company_suspects,
    active_mah,
    coi,
    patient_safety,
    pii,
    clinical_events,
    special_situations,
    exclusions,
):
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