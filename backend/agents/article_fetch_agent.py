from __future__ import annotations

import hashlib
import json
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


PUBMED_FETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_text(node: ET.Element | None) -> str:
    if node is None:
        return ""
    return "".join(node.itertext()).strip()


def fetch_pubmed_xml(pmid: str) -> str:
    response = requests.get(
        PUBMED_FETCH_URL,
        params={
            "db": "pubmed",
            "id": pmid,
            "retmode": "xml",
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.text


def parse_pubmed_metadata(xml_text: str) -> dict[str, Any]:
    root = ET.fromstring(xml_text)

    article = root.find(".//PubmedArticle")
    if article is None:
        raise ValueError("No PubMedArticle found in XML.")

    pmid = safe_text(article.find(".//MedlineCitation/PMID"))
    title = safe_text(article.find(".//ArticleTitle"))
    journal = safe_text(article.find(".//Journal/Title"))

    doi = ""
    for article_id in article.findall(".//ArticleId"):
        if article_id.attrib.get("IdType") == "doi":
            doi = safe_text(article_id)
            break

    abstract_parts = []
    for abstract_text in article.findall(".//Abstract/AbstractText"):
        label = abstract_text.attrib.get("Label")
        text = safe_text(abstract_text)
        if label and text:
            abstract_parts.append(f"{label}: {text}")
        elif text:
            abstract_parts.append(text)

    authors = []
    affiliations = []

    for author in article.findall(".//AuthorList/Author"):
        last = safe_text(author.find("LastName"))
        fore = safe_text(author.find("ForeName"))
        initials = safe_text(author.find("Initials"))

        name = " ".join([x for x in [fore, last] if x]).strip()
        if not name and initials and last:
            name = f"{initials} {last}"

        if name:
            authors.append(name)

        for aff in author.findall(".//AffiliationInfo/Affiliation"):
            aff_text = safe_text(aff)
            if aff_text:
                affiliations.append(aff_text)

    pub_date_parts = []
    pub_date = article.find(".//JournalIssue/PubDate")
    if pub_date is not None:
        for tag in ["Year", "Month", "Day"]:
            value = safe_text(pub_date.find(tag))
            if value:
                pub_date_parts.append(value)

    return {
        "pmid": pmid,
        "doi": doi,
        "title": title,
        "journal": journal,
        "publication_date": " ".join(pub_date_parts),
        "primary_author": authors[0] if authors else "",
        "authors": authors,
        "affiliations": affiliations,
        "abstract": "\n".join(abstract_parts),
        "source": "PubMed",
        "retrieved_at_utc": now_utc(),
    }


def build_evidence_package(
    pmid: str,
    tenant_id: str = "demo-tenant",
    base_dir: str = "evidence_store",
) -> dict[str, Any]:
    package_dir = Path(base_dir) / tenant_id / f"PMID_{pmid}"
    package_dir.mkdir(parents=True, exist_ok=True)

    xml_text = fetch_pubmed_xml(pmid)
    metadata = parse_pubmed_metadata(xml_text)

    pubmed_xml_path = package_dir / "pubmed.xml"
    metadata_path = package_dir / "metadata.json"
    abstract_path = package_dir / "abstract.txt"
    hash_path = package_dir / "hash.json"
    manifest_path = package_dir / "evidence_manifest.json"

    pubmed_xml_path.write_text(xml_text, encoding="utf-8")
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    abstract_path.write_text(metadata.get("abstract", ""), encoding="utf-8")

    hashes = {
        "pubmed.xml": sha256_text(xml_text),
        "metadata.json": sha256_text(json.dumps(metadata, sort_keys=True)),
        "abstract.txt": sha256_text(metadata.get("abstract", "")),
    }

    hash_path.write_text(json.dumps(hashes, indent=2), encoding="utf-8")

    manifest = {
        "evidence_package_id": f"{tenant_id}_PMID_{pmid}",
        "tenant_id": tenant_id,
        "pmid": pmid,
        "created_at_utc": now_utc(),
        "retrieval_status": "success",
        "sources": {
            "pubmed_xml": True,
            "abstract": bool(metadata.get("abstract")),
            "full_text_pdf": False,
            "full_text_xml": False,
            "ocr": False,
        },
        "files": {
            "pubmed_xml": str(pubmed_xml_path),
            "metadata": str(metadata_path),
            "abstract": str(abstract_path),
            "hash": str(hash_path),
        },
        "hashes": hashes,
    }

    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    pmid = input("Enter PMID: ").strip()
    result = build_evidence_package(pmid)
    print(json.dumps(result, indent=2))