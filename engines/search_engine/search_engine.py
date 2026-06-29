from datetime import datetime
from providers.literature.pubmed_provider import search_pubmed, fetch_pubmed_records

def execute_literature_search(query, product=None, product_id=None, source="PubMed", limit=50):
    if not query or not query.strip():
        raise ValueError("Search query is required.")

    if source != "PubMed":
        raise ValueError(f"Source not supported yet: {source}")

    pmids = search_pubmed(query=query.strip(), limit=limit)
    records = fetch_pubmed_records(pmids)

    for record in records:
        record["Product"] = product or "Not Assigned"
        record["Product ID"] = product_id or "PID-GENERIC"
        record["Company Suspect"] = product or "Not Assigned"
        record["Current_Stage"] = "Hits"
        record["Status"] = "Ready for Screening"
        record["Search_Source"] = source
        record["Search_Executed_At"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return records
