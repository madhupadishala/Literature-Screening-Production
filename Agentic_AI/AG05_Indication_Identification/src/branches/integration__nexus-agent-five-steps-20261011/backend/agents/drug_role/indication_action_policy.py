"""Step 2.5: source-grounded, per-product indication and action-taken normalization.

Inputs MUST be upstream validated extraction facts with direct source evidence.
No clinical actions, indications, or product attribution are inferred from prose.
"""
from __future__ import annotations
from typing import Any

_ACTIONS = {
    "drug withdrawn": "DRUG_WITHDRAWN",
    "withdrawn": "DRUG_WITHDRAWN",
    "dose reduced": "DOSE_REDUCED",
    "dose increased": "DOSE_INCREASED",
    "dose not changed": "DOSE_NOT_CHANGED",
    "no change": "DOSE_NOT_CHANGED",
    "dose interrupted": "DOSE_INTERRUPTED",
    "temporarily interrupted": "DOSE_INTERRUPTED",
    "unknown": "UNKNOWN",
    "not applicable": "NOT_APPLICABLE",
}

def normalize_indications_actions(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return drug-specific source-evidenced facts; preserve unknown and separate episodes."""
    if not isinstance(items, list):
        raise ValueError("Validated drug fact records must be a list")
    results = []
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Each drug fact record must be an object")
        product_id = item.get("product_id")
        if not isinstance(product_id, str) or not product_id.strip():
            raise ValueError("Each record needs a stable product_id")
        indication = item.get("indication")
        indication_evidence = item.get("indication_evidence")
        if indication is not None and (
            not isinstance(indication, str) or not indication.strip()
            or not isinstance(indication_evidence, str) or not indication_evidence.strip()
        ):
            raise ValueError("Indication must have validated source evidence")
        action = item.get("action_taken")
        action_evidence = item.get("action_evidence")
        if action is None:
            normalized_action = "UNKNOWN"
        else:
            if not isinstance(action, str) or not action.strip():
                raise ValueError("Invalid action taken")
            normalized_action = _ACTIONS.get(action.strip().casefold())
            if normalized_action is None:
                normalized_action = "UNKNOWN"
            if not isinstance(action_evidence, str) or not action_evidence.strip():
                raise ValueError("Action taken must have validated source evidence")
        results.append({
            "product_id": product_id.strip(),
            "indication": indication.strip() if indication else None,
            "indication_evidence": indication_evidence,
            "action_taken": normalized_action,
            "action_verbatim": action,
            "action_evidence": action_evidence,
            "event_id": item.get("event_id"),
            "episode_id": item.get("episode_id"),
            "review_required": normalized_action == "UNKNOWN",
        })
    return results
