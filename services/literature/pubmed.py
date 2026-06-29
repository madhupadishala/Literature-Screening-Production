import requests
import xml.etree.ElementTree as ET
from datetime import datetime

PUBMED_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_FETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

def search_pubmed(query, retmax=50):
    response = requests.get(
        PUBMED_SEARCH_URL,
        params={
            "db": "pubmed",
            "term": query,
            "retmode": "json",
            "retmax": retmax,
        },
        timeout=20,
    )
    response.raise_for_status()
    data = response.json()
    return data.get("esearchresult", {}).get("idlist", [])

def fetch_pubmed_details(pmids):
    if not pmids:
        return []

    response = requests.get(
        PUBMED_FETCH_URL,
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
        abs_node = article.find(".//Abstract")

        pmid = pmid_node.text if pmid_node is not None else ""
        title = "".join(title_node.itertext()) if title_node is not None else "Title not available"
        journal = journal_node.text if journal_node is not None else "Unknown"

        abstract = ""
        if abs_node is not None:
            abstract = " ".join(
                ["".join(t.itertext()) for t in abs_node.findall("AbstractText")]
            )

        records.append({
            "PMID": pmid,
            "Title": title,
            "Abstract": abstract,
            "Journal": journal,
            "Source": "PubMed",
            "Current_Stage": "Hits",
            "Status": "Unscreened",
            "Outcome": "",
            "Classification": "",
            "Reviewer": "",
            "QC": "",
            "Date": datetime.now().strftime("%Y-%m-%d"),
        })

    return records

def run_pubmed_search(query, retmax=50):
    pmids = search_pubmed(query, retmax=retmax)
    return fetch_pubmed_details(pmids)
