from dataclasses import dataclass, field
from typing import List, Dict


@dataclass
class CanonicalArticle:

    package_id: str

    tenant_id: str

    pmid: str

    doi: str

    title: str

    journal: str

    publication_date: str

    authors: List[str] = field(default_factory=list)

    affiliations: List[str] = field(default_factory=list)

    abstract: str = ""

    full_text: str = ""

    combined_text: str = ""

    language: str = "Unknown"

    hashes: Dict = field(default_factory=dict)

    metadata: Dict = field(default_factory=dict)