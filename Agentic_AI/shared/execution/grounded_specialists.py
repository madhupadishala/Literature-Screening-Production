"""Conservative source-grounded native engines for AG05, AG07, AG16, AG27.

No autonomous clinical decisions. No LLM or external service. No invented facts.
These processors expose only supported textual evidence and always request PV review.
"""
from __future__ import annotations
import json
import re
from typing import Any

def _source(evidence: dict) -> str:
    text = evidence.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > 100_000:
        raise ValueError("bounded source document text required")
    return text

def _span(text: str, match: re.Match, field: str, value: str) -> dict:
    return {"field": field, "value": value, "quote": match.group(0),
            "start": match.start(), "end": match.end()}

def _result(agent: str, observations: list[dict], warnings: list[str]) -> dict:
    return {"agent": agent, "status": "review_required", "requires_human_review": True,
            "observations": observations, "warnings": warnings,
            "autonomous_decision": False}

def indication(evidence: dict, pack) -> dict:
    """AG05: explicit prescribed-for / indicated-for observations, not inferred use."""
    text = _source(evidence)
    products = []
    for product in getattr(pack, "product_master_matches", []):
        for key in ("trade_name", "generic_name"):
            v = product.get(key) if isinstance(product, dict) else None
            if isinstance(v, str) and len(v) >= 2:
                products.append(v)
    spans = []
    for drug in sorted(set(products), key=len, reverse=True):
        rx = re.compile(r"\b" + re.escape(drug) +
                        r"\b\s+(?:was\s+)?(?:prescribed|given|used|indicated)\s+for\s+" +
                        r"(?P<indication>[A-Za-z][A-Za-z0-9 /-]{2,80})(?=[.;,\n]|$)", re.I)
        for m in rx.finditer(text):
            spans.append({**_span(text, m, "indication", m.group("indication").strip()),
                          "product": drug})
    return _result("AG05", spans, [] if spans else ["no_explicit_indication_evidence"])

_LAB = re.compile(
    r"\b(?P<analyte>ALT|AST|ALP|bilirubin|creatinine|haemoglobin|hemoglobin|platelets|"
    r"potassium|sodium|glucose|INR|WBC|HbA1c)\b"
    r"\s*(?:[:=]|was|of)?\s*(?P<value>\d{1,5}(?:\.\d{1,3})?)"
    r"\s*(?P<unit>U/L|IU/L|mg/dL|mmol/L|g/dL|g/L|%|10\^9/L|x10\^9/L)?\b", re.I)

def laboratory(evidence: dict, pack) -> dict:
    """AG07: report verbatim numerical lab observations without classifying abnormality."""
    text = _source(evidence)
    observations = []
    for m in _LAB.finditer(text):
        observations.append({**_span(text, m, "laboratory_value", m.group("value")),
                             "analyte": m.group("analyte"),
                             "unit_as_reported": m.group("unit")})
    return _result("AG07", observations,
                   ["reference_range_and_clinical_interpretation_required"] if observations
                   else ["no_supported_lab_observation"])

def aesi(evidence: dict, pack) -> dict:
    """AG16: explicit matches against SIGNED, approved AESI lists in the scoped KB."""
    text = _source(evidence)
    approved = [d for d in getattr(pack, "approved_documents", [])
                if d.get("knowledge_type") == "aesi_list"]
    if not approved:
        return _result("AG16", [], ["no_approved_client_scoped_aesi_list"])
    observations = []
    for document in approved:
        try:
            terms = json.loads(document["content"])["aesi_terms"]
        except (ValueError, TypeError, KeyError):
            continue
        if not isinstance(terms, list):
            continue
        for term in terms:
            if not isinstance(term, str) or not 3 <= len(term) <= 120:
                continue
            for m in re.finditer(r"(?<!\w)" + re.escape(term) + r"(?!\w)", text, re.I):
                prefix = text[max(0, m.start() - 30):m.start()]
                if re.search(r"\b(no|denies|without|negative for)\s*$", prefix, re.I):
                    continue
                observations.append({**_span(text, m, "possible_aesi", term),
                                    "knowledge_document_id": document["rule_id"],
                                    "knowledge_sha256": document["content_sha256"]})
    return _result("AG16", observations,
                   ["list_match_requires_clinical_review"] if observations
                   else ["no_positive_list_match_does_not_exclude_aesi"])

_PATIENT = re.compile(r"\b(?:a|one|the)\s+(?:\d{1,3}[- ]year[- ]old\s+)?"
                      r"(?:patient|man|woman|boy|girl|infant)\b", re.I)
_AGGREGATE = re.compile(r"\b(?:retrospective cohort|meta-analysis|systematic review|"
                        r"population-based study|aggregate data|pooled analysis|case series)\b", re.I)

def patient_aggregate(evidence: dict, pack) -> dict:
    """AG27: classify explicit document clues, never manufacture patient-level cases."""
    text = _source(evidence)
    patients = [_span(text, m, "patient_descriptor", m.group(0)) for m in _PATIENT.finditer(text)]
    aggregates = [_span(text, m, "aggregate_descriptor", m.group(0)) for m in _AGGREGATE.finditer(text)]
    relation = ("mixed_review" if patients and aggregates else
                "possible_patient_level" if patients else
                "possible_aggregate" if aggregates else "unresolved")
    result = _result("AG27", patients + aggregates, ["human_patient_linkage_review_required"])
    result["classification"] = relation
    return result

GROUNDED_BINDINGS = {
    "AG05": indication, "AG07": laboratory, "AG16": aesi, "AG27": patient_aggregate,
}
