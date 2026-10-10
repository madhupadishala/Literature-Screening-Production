from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from product_resolver_agent import resolve_product, build_search_terms


TEMPLATE_PATH = Path("backend/knowledge/search_templates/templates.json")


def load_templates(path: Path = TEMPLATE_PATH) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Search templates not found: {path}")

    return json.loads(path.read_text(encoding="utf-8"))


def get_template(
    template_id: str = "PV-GENERAL",
    tenant_id: str = "demo-tenant",
    path: Path = TEMPLATE_PATH,
) -> dict[str, Any]:
    templates = load_templates(path)

    for template in templates:
        if (
            template.get("tenant_id") == tenant_id
            and template.get("template_id") == template_id
            and template.get("status") == "Active"
        ):
            return template

    raise ValueError(f"Active template not found: {template_id}")


def quote_terms(terms: list[str]) -> list[str]:
    return [f'"{term}"' for term in terms if term.strip()]


def build_date_filter(
    date_mode: str = "Any date",
    start_date: str = "",
    end_date: str = "",
) -> str:
    if date_mode == "Specific date" and start_date:
        return f' AND "{start_date}"[Date - Publication]'

    if date_mode == "Date range" and start_date and end_date:
        return f' AND ("{start_date}"[Date - Publication] : "{end_date}"[Date - Publication])'

    return ""


def build_pubmed_query(
    product_input: str = "",
    manual_query: str = "",
    search_mode: str = "Automatic",
    template_id: str = "PV-GENERAL",
    tenant_id: str = "demo-tenant",
    date_mode: str = "Any date",
    start_date: str = "",
    end_date: str = "",
) -> dict[str, Any]:
    template = get_template(template_id=template_id, tenant_id=tenant_id)

    resolved = resolve_product(product_input, tenant_id=tenant_id)

    if search_mode == "Manual" and manual_query.strip():
        base_query = manual_query.strip()
        product_context = resolved
    else:
        if not resolved["resolved"]:
            if manual_query.strip():
                base_query = manual_query.strip()
            else:
                base_query = ""
        else:
            product_terms = build_search_terms(resolved["product"])
            pv_terms = template.get("terms", [])

            product_block = f"({' OR '.join(quote_terms(product_terms))})"
            pv_block = f"({' OR '.join(quote_terms(pv_terms))})"

            base_query = f"{product_block} AND {pv_block}"

        product_context = resolved

    final_query = base_query + build_date_filter(date_mode, start_date, end_date)

    pubmed_url = (
        "https://pubmed.ncbi.nlm.nih.gov/?term="
        + final_query.replace(" ", "+").replace('"', "%22")
    )

    return {
        "tenant_id": tenant_id,
        "source": "PubMed",
        "search_mode": search_mode,
        "template_id": template_id,
        "template_name": template.get("template_name"),
        "product_resolved": product_context["resolved"],
        "matched_term": product_context.get("matched_term", ""),
        "product": product_context.get("product"),
        "date_mode": date_mode,
        "start_date": start_date,
        "end_date": end_date,
        "generated_query": final_query,
        "pubmed_url": pubmed_url,
    }


if __name__ == "__main__":
    product_input = input("Enter Product ID / Name / INN / Brand / Synonym: ").strip()
    mode = input("Search Mode [Automatic/Manual]: ").strip() or "Automatic"
    manual = ""

    if mode == "Manual":
        manual = input("Enter manual Boolean query: ").strip()

    date_mode = input("Date Mode [Any date/Specific date/Date range]: ").strip() or "Any date"
    start = ""
    end = ""

    if date_mode in ["Specific date", "Date range"]:
        start = input("Start/Search Date [YYYY-MM-DD]: ").strip()

    if date_mode == "Date range":
        end = input("End Date [YYYY-MM-DD]: ").strip()

    result = build_pubmed_query(
        product_input=product_input,
        manual_query=manual,
        search_mode=mode,
        date_mode=date_mode,
        start_date=start,
        end_date=end,
    )

    print(json.dumps(result, indent=2))