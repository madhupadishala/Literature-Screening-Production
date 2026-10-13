"""
article_fetch_agent.py
----------------------
ClinixAI Nexus Platform - Literature Screening Ingestion Component

Manages secure network retrieval of raw PubMed XML nodes, performs defensive
structural schema metadata parsing, and writes immutable evidence packages
to disk using atomic transactions.
"""

from __future__ import annotations

import hashlib
import json
import logging
import tempfile
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

# Initialize standard logging structure for the data ingestion cluster
logger = logging.getLogger("nexus.platform.literature.fetch_agent")


class ArticleFetchAgent:
    """
    Enterprise data ingestion worker responsible for retrieving PubMed records,
    validating schemas, and establishing immutable audit trails.
    """

    PUBMED_FETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

    def __init__(self, api_key: Optional[str] = None) -> None:
        self.api_key = api_key
        self.request_headers = {
            "User-Agent": "ClinixAINexusPlatform/2.0 (compliance-ops@clinixai.com)"
        }

    @staticmethod
    def sha256_text(text: str) -> str:
        """Computes secure SHA-256 signatures for cryptographic data verification."""
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    @staticmethod
    def now_utc() -> str:
        """Generates immutable ISO-8601 UTC timestamps."""
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def safe_text(node: ET.Element | None) -> str:
        """Safely extracts inner text values from XML tree nodes without throwing NoneType exceptions."""
        if node is None:
            return ""
        return "".join(node.itertext()).strip()

    def fetch_pubmed_xml(self, pmid: str, max_retries: int = 3) -> str:
        """
        Fetches raw XML data profiles from PubMed with network retry backoff loops.
        """
        if not pmid or not pmid.strip():
            raise ValueError("PMID target parameter cannot be null or empty.")

        params = {
            "db": "pubmed",
            "id": pmid.strip(),
            "retmode": "xml",
        }
        if self.api_key:
            params["api_key"] = self.api_key

        current_attempt = 0
        backoff_delay = 2.0

        while current_attempt < max_retries:
            try:
                current_attempt += 1
                logger.debug(f"[Fetch Node] Retrieving PMID {pmid} XML. Attempt [{current_attempt}/{max_retries}]")
                
                response = requests.get(
                    self.PUBMED_FETCH_URL,
                    params=params,
                    headers=self.request_headers,
                    timeout=30
                )

                if response.status_code == 429:
                    logger.warning(f"NCBI Rate Limit boundary hit for PMID {pmid}. Retrying in {backoff_delay}s...")
                    time.sleep(backoff_delay)
                    backoff_delay *= 2
                    continue

                response.raise_for_status()
                return response.text

            except requests.exceptions.RequestException as req_err:
                logger.warning(f"Network degradation on PMID {pmid} (Attempt {current_attempt}/{max_retries}): {str(req_err)}")
                if current_attempt >= max_retries:
                    logger.critical(f"Exhausted all available retry boundaries pulling PMID: {pmid}")
                    raise
                time.sleep(backoff_delay)
                backoff_delay *= 2

        raise requests.exceptions.RetryError(f"Failed to fetch content for PMID {pmid} after max retries.")

    def parse_pubmed_metadata(self, xml_text: str) -> Dict[str, Any]:
        """
        Defensively parses PubMed structural XML payloads into strict Python dictionaries.
        """
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as parse_err:
            logger.error(f"Failed to read input payload. Invalid XML structure: {str(parse_err)}")
            raise ValueError(f"Malformed XML string caught at edge gate: {str(parse_err)}") from parse_err

        article = root.find(".//PubmedArticle")
        if article is None:
            logger.error("Data contract breach: Element 'PubmedArticle' missing from PubMed response tree.")
            raise ValueError("No PubMedArticle found in XML metadata payload.")

        pmid = self.safe_text(article.find(".//MedlineCitation/PMID"))
        title = self.safe_text(article.find(".//ArticleTitle"))
        journal = self.safe_text(article.find(".//Journal/Title"))

        doi = ""
        for article_id in article.findall(".//ArticleId"):
            if article_id.attrib.get("IdType") == "doi":
                doi = self.safe_text(article_id)
                break

        abstract_parts = []
        for abstract_text in article.findall(".//Abstract/AbstractText"):
            label = abstract_text.attrib.get("Label")
            text = self.safe_text(abstract_text)
            if label and text:
                abstract_parts.append(f"{label}: {text}")
            elif text:
                abstract_parts.append(text)

        authors: List[str] = []
        affiliations: List[str] = []

        for author in article.findall(".//AuthorList/Author"):
            last = self.safe_text(author.find("LastName"))
            fore = self.safe_text(author.find("ForeName"))
            initials = self.safe_text(author.find("Initials"))

            name = " ".join([x for x in [fore, last] if x]).strip()
            if not name and initials and last:
                name = f"{initials} {last}"

            if name:
                authors.append(name)

            for aff in author.findall(".//AffiliationInfo/Affiliation"):
                aff_text = self.safe_text(aff)
                if aff_text:
                    affiliations.append(aff_text)

        pub_date_parts = []
        pub_date = article.find(".//JournalIssue/PubDate")
        if pub_date is not None:
            for tag in ["Year", "Month", "Day"]:
                value = self.safe_text(pub_date.find(tag))
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
            "retrieved_at_utc": self.now_utc(),
        }

    def build_evidence_package(
        self,
        pmid: str,
        tenant_id: str = "demo-tenant",
        base_dir: str | Path = "evidence_store",
    ) -> Dict[str, Any]:
        """
        Assembles, builds, and atomically saves the structured processing framework files on disk.
        """
        package_dir = Path(base_dir) / tenant_id / f"PMID_{pmid}"
        package_dir.mkdir(parents=True, exist_ok=True)

        # 1. Pipeline Execution Fetching & Mapping
        xml_text = self.fetch_pubmed_xml(pmid)
        metadata = self.parse_pubmed_metadata(xml_text)

        # 2. Establish File Pointers
        pubmed_xml_path = package_dir / "pubmed.xml"
        metadata_path = package_dir / "metadata.json"
        abstract_path = package_dir / "abstract.txt"
        hash_path = package_dir / "hash.json"
        manifest_path = package_dir / "evidence_manifest.json"

        # 3. Serialize Strings and Payloads Atomically
        self._write_text_atomic(pubmed_xml_path, xml_text)
        self._write_json_atomic(metadata_path, metadata)
        self._write_text_atomic(abstract_path, metadata.get("abstract", ""))

        # 4. Generate Hash Signatures for Compliance Integrity
        hashes = {
            "pubmed.xml": self.sha256_text(xml_text),
            "metadata.json": self.sha256_text(json.dumps(metadata, sort_keys=True)),
            "abstract.txt": self.sha256_text(metadata.get("abstract", "")),
        }
        self._write_json_atomic(hash_path, hashes)

        # 5. Build and Store Final Engine Ingestion Manifest
        manifest = {
            "evidence_package_id": f"{tenant_id}_PMID_{pmid}",
            "tenant_id": tenant_id,
            "pmid": pmid,
            "created_at_utc": self.now_utc(),
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
        self._write_json_atomic(manifest_path, manifest)
        
        logger.info(f"Successfully generated complete evidence package blueprint for [{tenant_id} - PMID {pmid}].")
        return manifest

    @staticmethod
    def _write_text_atomic(path: Path, content: str) -> None:
        """Atomically saves plaintext representations onto localized disk layers."""
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_filepath: Optional[Path] = None
        try:
            with tempfile.NamedTemporaryFile("w", dir=str(path.parent), delete=False, suffix=".tmp", encoding="utf-8") as tmp:
                tmp.write(content)
                tmp_filepath = Path(tmp.name)
            tmp_filepath.replace(path)
        except Exception as e:
            if tmp_filepath and tmp_filepath.exists():
                tmp_filepath.unlink()
            logger.critical(f"Disk Write Failure during atomic save at '{path}': {str(e)}")
            raise

    @staticmethod
    def _write_json_atomic(path: Path, data: Any) -> None:
        """Atomically saves serialized JSON objects onto localized disk layers."""
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_filepath: Optional[Path] = None
        try:
            with tempfile.NamedTemporaryFile("w", dir=str(path.parent), delete=False, suffix=".tmp", encoding="utf-8") as tmp:
                json.dump(data, tmp, indent=2, ensure_ascii=False)
                tmp_filepath = Path(tmp.name)
            tmp_filepath.replace(path)
        except Exception as e:
            if tmp_filepath and tmp_filepath.exists():
                tmp_filepath.unlink()
            logger.critical(f"JSON Persistence Failure during atomic save at '{path}': {str(e)}")
            raise


# Functional backward-compatibility wrappers to preserve support for historical modules
def sha256_text(text: str) -> str:
    return ArticleFetchAgent.sha256_text(text)

def now_utc() -> str:
    return ArticleFetchAgent.now_utc()

def safe_text(node: ET.Element | None) -> str:
    return ArticleFetchAgent.safe_text(node)

def fetch_pubmed_xml(pmid: str) -> str:
    return ArticleFetchAgent().fetch_pubmed_xml(pmid)

def parse_pubmed_metadata(xml_text: str) -> dict[str, Any]:
    return ArticleFetchAgent().parse_pubmed_metadata(xml_text)

def build_evidence_package(pmid: str, tenant_id: str = "demo-tenant", base_dir: str = "evidence_store") -> dict[str, Any]:
    return ArticleFetchAgent().build_evidence_package(pmid=pmid, tenant_id=tenant_id, base_dir=base_dir)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    input_pmid = input("Enter PMID: ").strip()
    if input_pmid:
        result_manifest = build_evidence_package(input_pmid)
        print(json.dumps(result_manifest, indent=2))