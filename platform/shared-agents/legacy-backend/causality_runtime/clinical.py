"""Deterministic clinical evidence derivation for a single drug-event pair.

This module does not assign a causality category. It converts structured facts into explicit
causality evidence dimensions. Missing evidence stays unknown. The rules intentionally distinguish
chronology from clinical temporal plausibility, and observed improvement from interpretable dechallenge.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict

from .schemas import Drug, Event, Timeline


@dataclass(frozen=True)
class ClinicalEvidence:
    chronology: str                    # compatible | implausible | after_stop | unknown
    temporal_plausibility: str         # compatible | delayed_compatible | implausible | indeterminate
    latency_days: int | None
    latency_fit: str                   # compatible | too_early | too_late | unknown
    exposure_present_at_onset: str     # yes | no | unknown
    dechallenge_interpretability: str  # interpretable | confounded | not_applicable | unknown
    dechallenge_response: str          # positive | negative | not_applicable | unknown
    recovery_interval_days: int | None
    recovery_fit: str                  # compatible | too_early | too_late | unknown
    rechallenge: str                   # positive | negative | not_done | unknown
    dose_response: str                 # yes | no | unknown
    prior_exposure: str                # yes | no | unknown
    objective_evidence: str            # yes | no | unknown
    biologic_plausibility: str         # supported | unsupported | unknown
    class_effect: str                  # yes | no | unknown
    structured_alternative_causes: str # yes | no | unknown
    alternative_causes: str            # yes | no | unknown; merged later with verified extraction
    known_association: str             # yes | unknown; populated later from governed KB
    data_completeness: str             # adequate | partial | sparse
    issues: tuple[str, ...]

    def as_dict(self) -> dict:
        return asdict(self)


def _yn(v: bool | None) -> str:
    return "unknown" if v is None else ("yes" if v else "no")


def _window_fit(value: int | None, lo: int | None, hi: int | None) -> str:
    if value is None or (lo is None and hi is None):
        return "unknown"
    if lo is not None and value < lo:
        return "too_early"
    if hi is not None and value > hi:
        return "too_late"
    return "compatible"


def derive_structured(drug: Drug, event: Event, timeline: Timeline) -> ClinicalEvidence:
    issues = list(timeline.data_issues)

    # Exposure at event onset. Delayed post-withdrawal reactions remain distinct from implausible timing.
    if event.onset_date is None or drug.start_date is None:
        exposure = "unknown"
    elif event.onset_date < drug.start_date:
        exposure = "no"
    elif drug.stop_date is None or event.onset_date <= drug.stop_date:
        exposure = "yes"
    else:
        exposure = "no"

    latency_fit = _window_fit(timeline.time_to_onset_days,
                              drug.expected_latency_min_days,
                              drug.expected_latency_max_days)

    # Temporal plausibility combines chronology with any configured product-specific latency window.
    if timeline.temporal == "implausible" or latency_fit == "too_early":
        temporal_plausibility = "implausible"
    elif timeline.temporal == "compatible" and latency_fit in ("compatible", "unknown"):
        # Chronology itself establishes a minimally plausible temporal sequence; a product-specific
        # latency window, when available, refines rather than gates the assessment.
        temporal_plausibility = "compatible"
    elif timeline.temporal == "after_stop":
        # A delayed reaction may be plausible only when a configured latency window still supports it.
        temporal_plausibility = "delayed_compatible" if latency_fit == "compatible" else "indeterminate"
    elif latency_fit == "too_late":
        temporal_plausibility = "implausible"
    else:
        temporal_plausibility = "indeterminate"

    recovery_interval_days = None
    if drug.stop_date and event.resolution_date:
        recovery_interval_days = (event.resolution_date - drug.stop_date).days
    recovery_fit = _window_fit(recovery_interval_days,
                               drug.expected_recovery_min_days,
                               drug.expected_recovery_max_days)

    # Dechallenge is interpretable only if the action and observed course support interpretation.
    if drug.action_taken == "continued":
        dech_i = "not_applicable"
    elif drug.action_taken not in ("withdrawn", "dose_reduced") and drug.stop_date is None:
        dech_i = "unknown"
    elif event.resolution_date and drug.stop_date and event.resolution_date < drug.stop_date:
        dech_i = "not_applicable"
    elif event.dechallenge_confounder is True or event.competing_interventions:
        dech_i = "confounded"
    elif timeline.dechallenge in ("positive", "negative"):
        dech_i = "interpretable"
    else:
        dech_i = "unknown"

    if timeline.dechallenge == "positive" and recovery_fit in ("too_early", "too_late"):
        issues.append(f"dechallenge_recovery_{recovery_fit}")
        if dech_i == "interpretable":
            dech_i = "confounded"

    # Long half-life + immediate recovery is a caution flag, not an automatic rejection.
    if (drug.half_life_hours and recovery_interval_days is not None and
            recovery_interval_days == 0 and drug.half_life_hours >= 72):
        issues.append("rapid_recovery_despite_long_half_life")
        if dech_i == "interpretable":
            dech_i = "confounded"

    structured_alt = "unknown"
    if event.alternative_etiologies or event.baseline_condition_explains_event is True:
        structured_alt = "yes"
    elif event.baseline_condition_explains_event is False:
        structured_alt = "no"

    biologic = drug.pharmacologic_plausibility or "unknown"
    class_effect = _yn(drug.class_effect_known)

    essential = [drug.start_date, event.onset_date]
    supporting_known = sum(x is not None for x in [drug.stop_date, event.resolution_date,
                                                    event.objective_confirmation, drug.rechallenge,
                                                    drug.dose_response_observed,
                                                    event.baseline_condition_explains_event])
    if all(x is not None for x in essential) and supporting_known >= 3:
        completeness = "adequate"
    elif any(x is not None for x in essential) or supporting_known >= 1:
        completeness = "partial"
    else:
        completeness = "sparse"

    return ClinicalEvidence(
        chronology=timeline.temporal,
        temporal_plausibility=temporal_plausibility,
        latency_days=timeline.time_to_onset_days,
        latency_fit=latency_fit,
        exposure_present_at_onset=exposure,
        dechallenge_interpretability=dech_i,
        dechallenge_response=timeline.dechallenge,
        recovery_interval_days=recovery_interval_days,
        recovery_fit=recovery_fit,
        rechallenge=drug.rechallenge or "unknown",
        dose_response=_yn(drug.dose_response_observed),
        prior_exposure=_yn(drug.prior_similar_exposure),
        objective_evidence=_yn(event.objective_confirmation),
        biologic_plausibility=biologic,
        class_effect=class_effect,
        structured_alternative_causes=structured_alt,
        alternative_causes="unknown",
        known_association="unknown",
        data_completeness=completeness,
        issues=tuple(dict.fromkeys(issues)),
    )
