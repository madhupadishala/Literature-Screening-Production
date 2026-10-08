from typing import Any, Dict, Iterable, Optional, Tuple

from .schemas import Ownership


def _tokens(value: str):
    return {t for t in value.lower().replace("-", " ").split() if len(t) > 2}


def _matches(name: str, product: Dict[str, Any]) -> bool:
    candidates = [
        product.get("trade_name", ""),
        product.get("generic_name", ""),
        product.get("product_name", ""),
        *(product.get("aliases", []) or []),
        *(product.get("active_ingredients", []) or []),
    ]
    name_l = name.lower().strip()
    name_tokens = _tokens(name)
    for candidate in candidates:
        if not candidate:
            continue
        candidate_l = str(candidate).lower().strip()
        if name_l == candidate_l:
            return True
        c_tokens = _tokens(candidate_l)
        if name_tokens and c_tokens and name_tokens == c_tokens:
            return True
    return False


def resolve_ownership(
    normalized_name: str,
    company_products: Iterable[Dict[str, Any]],
    known_non_company_products: Optional[Iterable[Dict[str, Any]]] = None,
) -> Tuple[Ownership, Optional[Dict[str, Any]], str]:
    for product in company_products or []:
        if _matches(normalized_name, product):
            return Ownership.COMPANY, product, "Matched effective tenant Product Master."

    for product in known_non_company_products or []:
        if _matches(normalized_name, product):
            return Ownership.NON_COMPANY, product, "Matched known non-company product reference."

    # Never infer non-company solely because a product is absent from Product Master.
    return Ownership.UNKNOWN, None, "Ownership not proven by controlled product data."
