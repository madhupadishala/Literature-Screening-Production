from __future__ import annotations

import json
from pathlib import Path
from typing import Any


PRODUCT_MASTER_PATH = Path("backend/knowledge/product_master/products.json")


def normalize(value: str) -> str:
    return value.strip().lower()


def load_products(path: Path = PRODUCT_MASTER_PATH) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Product master not found: {path}")

    return json.loads(path.read_text(encoding="utf-8"))


def resolve_product(
    query: str,
    tenant_id: str = "demo-tenant",
    path: Path = PRODUCT_MASTER_PATH,
) -> dict[str, Any]:
    products = load_products(path)
    q = normalize(query)

    candidates = [p for p in products if p.get("tenant_id") == tenant_id]

    for product in candidates:
        searchable_terms = [
            product.get("product_id", ""),
            product.get("product_name", ""),
            product.get("inn", ""),
            *product.get("brand_names", []),
            *product.get("synonyms", []),
        ]

        for term in searchable_terms:
            if normalize(term) == q:
                return {
                    "resolved": True,
                    "match_type": "exact",
                    "matched_term": term,
                    "product": product,
                }

    for product in candidates:
        searchable_terms = [
            product.get("product_id", ""),
            product.get("product_name", ""),
            product.get("inn", ""),
            *product.get("brand_names", []),
            *product.get("synonyms", []),
        ]

        for term in searchable_terms:
            if q and q in normalize(term):
                return {
                    "resolved": True,
                    "match_type": "partial",
                    "matched_term": term,
                    "product": product,
                }

    return {
        "resolved": False,
        "match_type": "none",
        "matched_term": "",
        "product": None,
    }


def build_search_terms(product: dict[str, Any]) -> list[str]:
    terms = [
        product.get("product_name", ""),
        product.get("inn", ""),
        *product.get("brand_names", []),
        *product.get("synonyms", []),
    ]

    unique_terms = []
    for term in terms:
        if term and term.lower() not in [t.lower() for t in unique_terms]:
            unique_terms.append(term)

    return unique_terms


def build_boolean_query(product: dict[str, Any]) -> str:
    terms = build_search_terms(product)
    quoted_terms = [f'"{term}"' for term in terms]

    return (
        f"({' OR '.join(quoted_terms)}) "
        'AND ("adverse event" OR toxicity OR safety OR injury)'
    )


if __name__ == "__main__":
    value = input("Enter Product ID / Name / INN / Brand / Synonym: ").strip()
    result = resolve_product(value)

    if not result["resolved"]:
        print(json.dumps(result, indent=2))
    else:
        product = result["product"]
        output = {
            "resolved": result["resolved"],
            "match_type": result["match_type"],
            "matched_term": result["matched_term"],
            "product_id": product["product_id"],
            "product_name": product["product_name"],
            "inn": product["inn"],
            "brand_names": product["brand_names"],
            "synonyms": product["synonyms"],
            "dosage_forms": product["dosage_forms"],
            "mah_countries": product["mah_countries"],
            "generated_query": build_boolean_query(product),
        }
        print(json.dumps(output, indent=2))