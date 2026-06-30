from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class Evidence:

    source_file: str
    source_type: str          # abstract/fulltext/xml/pdf
    sentence: str
    character_start: int
    character_end: int


@dataclass
class Fact:

    fact_id: str

    fact_type: str

    value: str

    confidence: float

    resolver: str

    resolver_version: str

    evidence: Evidence

    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    qc_required: bool = False

    notes: Optional[str] = None