"""
pubmed_search_executor.py
-------------------------
ClinixAI Nexus Platform - Literature Screening Engine Component

Manages secure network transport protocols, XML structural data parsing, 
and immutable audit log persistence targeting the NCBI PubMed E-Utilities gateway.
Supports standalone ad-hoc runs and direct Nexus modular integration.
"""

from __future__ import annotations

import json
import logging
import time
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

# Set up dedicated logging for the Nexus literature ingestion cluster
logger = logging.getLogger("nexus.platform.literature.pubmed_executor")


class PubmedSearchExecutor:
    """
    Production-grade plug-and-play executor managing PubMed data extraction.
    Features robust connection retries, safe XML element parsing, and atomic audits.
    """

    PUBMED_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"

    def __init__(self, api_key: Optional[str] = None) -> None:
        """
        Initializes the search executor with optional NCBI API credentials to scale rate boundaries.
        """
        self.api_key = api_key
        self.request_headers = {
            "User-Agent": "ClinixAINexusPlatform/2.0 (compliance-ops@clinixai.com)"
        }

    @staticmethod
    def get_utc_iso_timestamp() -> str:
        """Generates structured ISO-8601 UTC timestamps for compliance trails."""
        return datetime.now(timezone.utc).isoformat()

    def search_pubmed(self, query: str, retmax: int = 100, max_retries: int = 3) -> Dict[str, Any]:
        """
        Dispatches network query to PubMed ESearch engine with error handling and backoff validation.
        
        Args:
            query: The targeted Boolean search phrase or keyword string.
            retmax: Maximum volume of PMIDs to return inside the data array.
            max_retries: Network disconnect or rate-limiting backoff cap.
            
        Returns:
            Dict[str, Any]: Encapsulated structural manifest mapping counts and extracted IDs.
        """
        if not query or not query.strip():
            raise ValueError("Execution boundary violation: 'query' parameter cannot be empty.")

        logger.info(f"[Nexus Ingestion] Processing remote PubMed search strategy for query: '{query}'")
        
        params = {
            "db": "pubmed",
            "term": query,
            "retmode": "xml",
            "retmax": str(retmax),
        }
        if self.api_key:
            params["api_key"] = self.api_key

        response_text = ""
        current_attempt = 0
        backoff_delay = 2.0

        # Robust Exponential Backoff Loop to defend against 429 Rate Limits and 503 Gateway drops
        while current_attempt < max_retries:
            try:
                current_attempt += 1
                logger.debug(f"Dispatching HTTP network payload. Attempt [{current_attempt}/{max_retries}]")
                
                response = requests.get(
                    self.PUBMED_SEARCH_URL,
                    params=params,
                    headers=self.request_headers,
                    timeout=30  # Optimized from 60 to prevent long hanging worker threads
                )
                
                # Check for rate-limiting errors explicitly
                if response.status_code == 429:
                    logger.warning(f"PubMed Rate Boundary hit (HTTP 429). Backing off for {backoff_delay}s...")
                    time.sleep(backoff_delay)
                    backoff_delay *= 2
                    continue

                response.raise_for_status()
                response_text = response.text
                break

            except requests.exceptions.RequestException as req_err:
                logger.warning(f"Transport layer error caught on attempt [{current_attempt}/{max_retries}]: {str(req_err)}")
                if current_attempt >= max_retries:
                    logger.critical("Terminal transport layer exhaustion. Pipeline search aborted.")
                    raise
                time.sleep(backoff_delay)
                backoff_delay *= 2

        # Safe XML Payload Validation Gate
        try:
            root = ET.fromstring(response_text)
            pmids = [str(i.text) for i in root.findall(".//IdList/Id") if i.text]
            count_element = root.findtext(".//Count")
            count = int(count_element) if count_element else 0
            
            logger.info(f"[Nexus Ingestion] Query successfully validated. Found total records matching criteria: {count}")
            
            return {
                "count": count,
                "pmids": pmids,
                "raw_xml": response_text,
            }
        except ET.ParseError as xml_parse_err:
            logger.error(f"SCHEMA CORRUPTION: PubMed response body is invalid XML: {str(xml_parse_err)}")
            raise ValueError(f"Failed to parse target database XML string: {str(xml_parse_err)}") from xml_parse_err

    def create_search_audit(self, result: Dict[str, Any], query: str, base_audit_dir: str | Path = "audit") -> Path:
        """
        Atomically persists an immutable compliance log trail to disk.
        Prevents half-written files if high concurrent network calls drop out.
        """
        audit_dir = Path(base_audit_dir)
        audit_dir.mkdir(parents=True, exist_ok=True)

        audit_payload = {
            "search_timestamp": self.get_utc_iso_timestamp(),
            "query": query,
            "database": "PubMed",
            "returned_pmids": result.get("pmids", []),
            "returned_count": result.get("count", 0),
        }

        # Formulate secure filename pattern
        timestamp_str = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_UTC')
        outfile = audit_dir / f"search_{timestamp_str}.json"

        # Atomic Write Routine utilizing temporary filesystem staging variables
        tmp_filepath: Optional[Path] = None
        try:
            with tempfile.NamedTemporaryFile(
                "w",
                dir=str(audit_dir),
                delete=False,
                suffix=".tmp",
                encoding="utf-8"
            ) as tmp_file:
                json.dump(audit_payload, tmp_file, indent=2, ensure_ascii=False)
                tmp_filepath = Path(tmp_file.name)

            # Atomic file swap replacement
            tmp_filepath.replace(outfile)
            logger.debug(f"[Compliance Audit] Secure audit lock achieved at '{outfile}'")
            return outfile

        except Exception as write_error:
            logger.critical(f"PERSISTENCE FAILURE: Failed logging compliance metadata map: {str(write_error)}")
            if tmp_filepath and tmp_filepath.exists():
                try:
                    tmp_filepath.unlink()
                except Exception:
                    pass
            raise


# Functional backward-compatibility wrapper to support old workflow entry hooks seamlessly
def search_pubmed(query: str, retmax: int = 100) -> Dict[str, Any]:
    return PubmedSearchExecutor().search_pubmed(query=query, retmax=retmax)

def create_search_audit(result: Dict[str, Any], query: str) -> Path:
    return PubmedSearchExecutor().create_search_audit(result=result, query=query)


if __name__ == "__main__":
    # Standard fallback logging to output console when run directly by engineering associates
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    
    print("\n--- ClinixAI Nexus Literature Engine Terminal Mode ---")
    user_query = input("PubMed Query : ").strip()
    
    if not user_query:
        print("Execution aborted: Query string cannot be empty.")
        exit(1)
        
    try:
        executor = PubmedSearchExecutor()
        search_result = executor.search_pubmed(user_query)
        saved_audit_path = executor.create_search_audit(search_result, user_query)
        
        print("\n" + "=" * 60)
        print(" Nexus Search Execution Completed Successfully")
        print("=" * 60)
        print(f"Articles Found   : {search_result['count']}")
        print(f"Audit Log Saved  : {saved_audit_path}")
        print(f"First 20 PMIDs   : {search_result['pmids'][:20]}")
        print("=" * 60 + "\n")
        
    except Exception as fatal_error:
        print(f"\nCRITICAL ENGINE ERROR: {str(fatal_error)}\n")
        exit(1)