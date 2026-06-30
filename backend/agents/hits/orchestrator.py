from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_metadata(package_dir: Path) -> dict[str, Any]:
    metadata_path = package_dir / "metadata.json"
    if not metadata_path.exists():
        raise FileNotFoundError(f"metadata.json not found: {metadata_path}")

    return json.loads(metadata_path.read_text(encoding="utf-8"))


def metadata_agent(metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        "pmid": {
            "value": metadata.get("pmid", ""),
            "confidence": 100,
            "evidence": "PubMed XML PMID",
            "qc_status": "Auto-verified",
        },
        "doi": {
            "value": metadata.get("doi", ""),
            "confidence": 95 if metadata.get("doi") else 0,
            "evidence": "PubMed XML ArticleId DOI",
            "qc_status": "Auto-verified" if metadata.get("doi") else "Needs QC",
        },
        "title": {
            "value": metadata.get("title", ""),
            "confidence": 100 if metadata.get("title") else 0,
            "evidence": "PubMed XML ArticleTitle",
            "qc_status": "Auto-verified" if metadata.get("title") else "Needs QC",
        },
        "journal": {
            "value": metadata.get("journal", ""),
            "confidence": 100 if metadata.get("journal") else 0,
            "evidence": "PubMed XML Journal Title",
            "qc_status": "Auto-verified" if metadata.get("journal") else "Needs QC",
        },
        "publication_date": {
            "value": metadata.get("publication_date", ""),
            "confidence": 90 if metadata.get("publication_date") else 0,
            "evidence": "PubMed XML PubDate",
            "qc_status": "Auto-verified" if metadata.get("publication_date") else "Needs QC",
        },
    }


def author_agent(metadata: dict[str, Any]) -> dict[str, Any]:
    authors = metadata.get("authors", [])
    primary = metadata.get("primary_author", "")

    return {
        "primary_author": {
            "value": primary,
            "confidence": 100 if primary else 0,
            "evidence": "First author in PubMed XML AuthorList",
            "qc_status": "Auto-verified" if primary else "Needs QC",
        },
        "authors": {
            "value": "; ".join(authors),
            "confidence": 100 if authors else 0,
            "evidence": "PubMed XML AuthorList",
            "qc_status": "Auto-verified" if authors else "Needs QC",
        },
    }


def country_agent(metadata: dict[str, Any]) -> dict[str, Any]:
    affiliations = metadata.get("affiliations", [])
    affiliation_text = " ".join(affiliations)

    known_countries = [
        "India",
        "Germany",
        "United States",
        "United Kingdom",
        "France",
        "Italy",
        "Spain",
        "China",
        "Japan",
        "Australia",
        "Canada",
    ]

    country = ""
    for item in known_countries:
        if item.lower() in affiliation_text.lower():
            country = item
            break

    return {
        "primary_author_country": {
            "value": country or "Not identified",
            "confidence": 85 if country else 0,
            "evidence": "Country detected from PubMed affiliation text",
            "qc_status": "Auto-verified" if country else "Needs QC",
        }
    }


def product_agent(metadata: dict[str, Any]) -> dict[str, Any]:
    product_master = {
        "product": "Paracetamol",
        "inn": "Acetaminophen",
        "variants": ["tablet", "injection", "syrup", "oral suspension"],
        "synonyms": [
            "paracetamol",
            "acetaminophen",
            "tylenol",
            "apap",
            "n-acetyl-p-aminophenol",
        ],
        "mah_countries": ["India", "Germany", "United States", "United Kingdom"],
    }

    text = f"{metadata.get('title', '')} {metadata.get('abstract', '')}".lower()

    matched_synonym = ""
    for synonym in product_master["synonyms"]:
        if synonym in text:
            matched_synonym = synonym
            break

    matched_variant = ""
    for variant in product_master["variants"]:
        if variant in text:
            matched_variant = variant.title()
            break

    country_output = country_agent(metadata)["primary_author_country"]["value"]
    mah_country = (
        country_output
        if country_output in product_master["mah_countries"]
        else "Needs verification"
    )

    return {
        "product": {
            "value": product_master["product"],
            "confidence": 95 if matched_synonym else 60,
            "evidence": f"Product Master synonym match: {matched_synonym or 'No direct match'}",
            "qc_status": "Auto-verified" if matched_synonym else "Needs QC",
        },
        "inn": {
            "value": product_master["inn"],
            "confidence": 100,
            "evidence": "Resolved from Product Master",
            "qc_status": "Auto-verified",
        },
        "product_variant": {
            "value": matched_variant or "Not confirmed",
            "confidence": 80 if matched_variant else 0,
            "evidence": "Detected from title/abstract text",
            "qc_status": "Auto-verified" if matched_variant else "Needs QC",
        },
        "mah_country": {
            "value": mah_country,
            "confidence": 90 if mah_country != "Needs verification" else 0,
            "evidence": "Compared detected country against Product Master MAH countries",
            "qc_status": "Auto-verified" if mah_country != "Needs verification" else "Needs QC",
        },
        "knowledge_match": {
            "value": matched_synonym or "No direct synonym match",
            "confidence": 95 if matched_synonym else 0,
            "evidence": "Product Master synonym dictionary",
            "qc_status": "Auto-verified" if matched_synonym else "Needs QC",
        },
    }


def pii_agent(metadata: dict[str, Any]) -> dict[str, Any]:
    text = f"{metadata.get('title', '')} {metadata.get('abstract', '')}".lower()

    pii_indicators = [
        "patient",
        "year-old",
        "male",
        "female",
        "woman",
        "man",
        "pregnant",
        "initials",
        "date of birth",
        "dob",
    ]

    found = [term for term in pii_indicators if term in text]
    pii = "Yes" if found else "No"

    return {
        "pii": {
            "value": pii,
            "confidence": 80 if found else 70,
            "evidence": f"PII indicator terms detected: {', '.join(found) if found else 'None'}",
            "qc_status": "Needs QC" if found else "Auto-verified",
        }
    }


def full_text_agent(package_dir: Path) -> dict[str, Any]:
    fulltext_pdf = package_dir / "fulltext.pdf"
    fulltext_xml = package_dir / "fulltext.xml"

    if fulltext_pdf.exists():
        availability = "Full Text"
        link = str(fulltext_pdf)
        confidence = 100
        qc_status = "Auto-verified"
        evidence = "fulltext.pdf exists in Evidence Package"
    elif fulltext_xml.exists():
        availability = "Full Text"
        link = str(fulltext_xml)
        confidence = 100
        qc_status = "Auto-verified"
        evidence = "fulltext.xml exists in Evidence Package"
    else:
        availability = "Abstract"
        link = ""
        confidence = 90
        qc_status = "Auto-verified"
        evidence = "No fulltext.pdf/fulltext.xml found; abstract.txt available"

    return {
        "text_availability": {
            "value": availability,
            "confidence": confidence,
            "evidence": evidence,
            "qc_status": qc_status,
        },
        "full_text_link": {
            "value": link,
            "confidence": confidence if link else 0,
            "evidence": evidence,
            "qc_status": qc_status if link else "Not applicable",
        },
    }


def build_flat_hits_output(field_results: dict[str, Any]) -> dict[str, Any]:
    def val(field: str) -> Any:
        return field_results.get(field, {}).get("value", "")

    def qc_required() -> bool:
        return any(v.get("qc_status") == "Needs QC" for v in field_results.values())

    return {
        "S.No": 1,
        "PMID": val("pmid"),
        "DOI": val("doi"),
        "Primary Author": val("primary_author"),
        "Primary Author Country": val("primary_author_country"),
        "Authors": val("authors"),
        "Product": val("product"),
        "INN": val("inn"),
        "Product Variant": val("product_variant"),
        "MAH Country": val("mah_country"),
        "PII": val("pii"),
        "Full Text / Abstract": val("text_availability"),
        "Full Text Link": val("full_text_link"),
        "Knowledge Match": val("knowledge_match"),
        "QC Required": qc_required(),
    }


def run_hits_pipeline(
    pmid: str,
    tenant_id: str = "demo-tenant",
    base_dir: str = "evidence_store",
) -> dict[str, Any]:
    package_dir = Path(base_dir) / tenant_id / f"PMID_{pmid}"

    metadata = load_metadata(package_dir)

    field_results: dict[str, Any] = {}
    field_results.update(metadata_agent(metadata))
    field_results.update(author_agent(metadata))
    field_results.update(country_agent(metadata))
    field_results.update(product_agent(metadata))
    field_results.update(pii_agent(metadata))
    field_results.update(full_text_agent(package_dir))

    hits_output = {
        "pmid": pmid,
        "tenant_id": tenant_id,
        "source_package": str(package_dir),
        "flat_output": build_flat_hits_output(field_results),
        "field_evidence": field_results,
    }

    output_path = package_dir / "hits_output.json"
    output_path.write_text(json.dumps(hits_output, indent=2), encoding="utf-8")

    return hits_output


if __name__ == "__main__":
    pmid_input = input("Enter PMID: ").strip()
    result = run_hits_pipeline(pmid_input)
    print(json.dumps(result["flat_output"], indent=2))