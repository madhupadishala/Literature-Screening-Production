from __future__ import annotations

import json
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

PUBMED_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"


def now():
    return datetime.now(timezone.utc).isoformat()


def search_pubmed(query: str, retmax: int = 100):
    r = requests.get(
        PUBMED_SEARCH_URL,
        params={
            "db": "pubmed",
            "term": query,
            "retmode": "xml",
            "retmax": retmax,
        },
        timeout=60,
    )

    r.raise_for_status()

    root = ET.fromstring(r.text)

    pmids = [i.text for i in root.findall(".//IdList/Id")]

    count = root.findtext(".//Count")

    return {
        "count": int(count),
        "pmids": pmids,
        "raw_xml": r.text,
    }


def create_search_audit(result, query):
    audit = {
        "search_timestamp": now(),
        "query": query,
        "database": "PubMed",
        "returned_pmids": result["pmids"],
        "returned_count": result["count"],
    }

    Path("audit").mkdir(exist_ok=True)

    outfile = (
        Path("audit")
        / f"search_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    )

    outfile.write_text(json.dumps(audit, indent=2), encoding="utf-8")

    return outfile


if __name__ == "__main__":

    query = input("PubMed Query : ")

    result = search_pubmed(query)

    audit = create_search_audit(result, query)

    print()

    print("=" * 60)

    print("Search Completed")

    print()

    print("Articles Found :", result["count"])

    print()

    print("First 20 PMIDs")

    print(result["pmids"][:20])

    print()

    print("Audit Saved :", audit)