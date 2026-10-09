"""DR-004..DR-012: source-grounded medicinal product/regimen normalization.

Consumes extracted source-evidenced product mentions. Does not infer strengths, forms,
routes, exposure dates or MAH attribution from narrative or incomplete fields.
"""
from __future__ import annotations
from typing import Any

def normalize_product_exposures(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str,str,str],dict[str, Any]] = {}
    for item in items:
        if not isinstance(item,dict) or not str(item.get("reported_name") or "").strip():
            raise ValueError("Every drug exposure requires a source-reported name")
        if not item.get("source_evidence"):
            raise ValueError("Drug exposure must retain source evidence")
        drug = str(item["reported_name"]).strip()
        generic = str(item.get("verified_generic_name") or drug).strip()
        strength = str(item.get("strength") or "").strip()
        form = str(item.get("formulation") or "").strip()
        # Route alone must never establish pharmaceutical form.
        key=(generic.casefold(),strength.casefold(),form.casefold())
        if key not in grouped:
            grouped[key]=dict(
                reported_name=drug,generic_name=generic,brand_name=drug if item.get("is_verified_brand") else generic,
                strength=strength or None,formulation=form or None,
                regimens=[],source_evidence=[],review_required=not bool(strength and form),
            )
        record=grouped[key]
        record["source_evidence"].append(item["source_evidence"])
        record["regimens"].append({
            "start_date":item.get("start_date"),"end_date":item.get("end_date"),
            "dose":item.get("dose"),"frequency":item.get("frequency"),
            "route":item.get("route"),"role":item.get("role","UNKNOWN"),
            "source_evidence":item["source_evidence"],
        })
        if record["reported_name"] != drug and item.get("is_verified_brand"):
            record["review_required"]=True
    return list(grouped.values())
