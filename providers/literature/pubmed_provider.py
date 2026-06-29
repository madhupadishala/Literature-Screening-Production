import requests
import xml.etree.ElementTree as ET
from datetime import datetime

SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
FETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

def search_pubmed(query, limit=50):
    response = requests.get(
        SEARCH_URL,
        params={
            "db": "pubmed",
            "term": query,
            "retmode": "json",
            "retmax": limit,
        },
        timeout=20,
    )
    response.raise_for_status()
    data = response.json()
    return data.get("esearchresult", {}).get("idlist", [])

def fetch_pubmed_records(pmids):
    if not pmids:
        return []

    response = requests.get(
        FETCH_URL,
        params={
            "db": "pubmed",
            "id": ",".join(pmids),
            "retmode": "xml",
        },
        timeout=30,
    )
    response.raise_for_status()

    root = ET.fromstring(response.text)
    records = []

    for article in root.findall(".//PubmedArticle"):
        pmid_node = article.find(".//MedlineCitation/PMID")
        title_node = article.find(".//ArticleTitle")
        journal_node = article.find(".//Journal/Title")
        abstract_node = article.find(".//Abstract")

        pmid = pmid_node.text if pmid_node is not None else ""
        title = "".join(title_node.itertext()) if title_node is not None else "Title not available"
        journal = journal_node.text if journal_node is not None else "Unknown"

        abstract = ""
        if abstract_node is not None:
            abstract = " ".join(
                "".join(text.itertext()) for text in abstract_node.findall("AbstractText")
            )

        records.append({
            "PMID": pmid,
            "Title": title,
            "Abstract": abstract,
            "Journal": journal,
            "Source": "PubMed",
            "Date": datetime.now().strftime("%Y-%m-%d"),
        })

    return records
