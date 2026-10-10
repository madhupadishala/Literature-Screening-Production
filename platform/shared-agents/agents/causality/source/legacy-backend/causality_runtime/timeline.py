"""Deterministic date logic. The LLM never computes or judges dates."""
from .schemas import Drug, Event, Timeline


def compute(drug: Drug, event: Event) -> Timeline:
    s, st, on, res = drug.start_date, drug.stop_date, event.onset_date, event.resolution_date
    issues: list[str] = []
    if s and st and st < s:
        issues.append("stop_before_start")
    if on and res and res < on:
        issues.append("resolution_before_onset")
    if drug.action_taken == "continued" and st:
        issues.append("continued_but_stop_date_present")

    tto = (on - s).days if (s and on) else None
    if tto is None:
        temporal = "unknown"
    elif tto < 0:
        temporal = "implausible"          # event began before first dose
    elif st and on > st:
        temporal = "after_stop"           # delayed onset: needs medical judgment, not auto
    else:
        temporal = "compatible"

    if drug.action_taken == "continued":
        dech = "not_applicable"
    elif drug.action_taken == "dose_reduced":
        dech = "unknown"
    elif drug.action_taken == "withdrawn" or st is not None:
        o = event.outcome
        if o in ("recovered", "recovering"):
            if res and st and res < st:
                dech = "not_applicable"   # resolved while drug still on
            else:
                dech = "positive"
        elif o == "not_recovered":
            dech = "negative"
        else:
            dech = "unknown"
    else:
        dech = "unknown"
    return Timeline(time_to_onset_days=tto, temporal=temporal, dechallenge=dech, data_issues=issues)
