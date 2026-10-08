"""Nexus shared Knowledge Base integration boundary and governed repository adapter.

The production causality service consumes tenant/client-scoped, versioned knowledge and never treats
retrieval absence as evidence of absence. `GovernedRepositoryKnowledgeAdapter` is compatible with the
current ClinixAI controlled repository `chunks.jsonl` format and enforces production eligibility + hashes.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Protocol
import hashlib
import json
import re

from .schemas import Citation


@dataclass(frozen=True)
class RetrievalRequest:
    tenant_id: str
    client_id: str | None
    query: str
    knowledge_types: tuple[str, ...]
    jurisdiction: str
    as_of: date
    product: str | None = None
    event: str | None = None
    top_k: int = 5


@dataclass(frozen=True)
class RetrievalResponse:
    citations: tuple[Citation, ...]
    snapshot_id: str
    retrieval_version: str
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class KbValidationReport:
    records_seen: int
    records_eligible: int
    hash_failures: int
    ineligible_records: int
    duplicate_ids: int
    production_safe: bool
    snapshot_id: str


class NexusKnowledgeClient(Protocol):
    def retrieve(self, request: RetrievalRequest) -> RetrievalResponse: ...


class LocalKnowledgeAdapter:
    """Adapter around the package-local KnowledgeStore; useful for tests and controlled fixtures."""
    def __init__(self, store):
        self.store = store

    def retrieve(self, request: RetrievalRequest) -> RetrievalResponse:
        from .kb import best_quote, make_citation
        cites = []
        keys = []
        for h in self.store.search(request.query, request.knowledge_types, request.jurisdiction,
                                   request.as_of, request.tenant_id, top_k=request.top_k):
            c = make_citation(h.chunk, best_quote(h.chunk, request.query))
            if c:
                cites.append(c); keys.append(h.chunk.key)
        snap = hashlib.sha256("\n".join(sorted(keys)).encode()).hexdigest()[:16]
        return RetrievalResponse(tuple(cites), snap, "local-hybrid-v1")


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


class GovernedRepositoryKnowledgeAdapter:
    """Read-only adapter for the ClinixAI governed `chunks.jsonl` knowledge snapshot.

    Required production fields match the current Nexus knowledge_loader contract:
    chunk_id, ko_id, title, domain, version, status, section, text, content_hash_sha256.
    Only Approved + effective_for_production=true content is eligible. Retrieval requires explicit
    tenant/client/jurisdiction scope and an effective date; GLOBAL must be declared explicitly.
    """

    REQUIRED = {"chunk_id", "ko_id", "title", "domain", "version", "status", "section", "text",
                "content_hash_sha256"}

    def __init__(self, chunks_path: str | Path, *, production: bool = True,
                 repository_version: str = "unknown"):
        self.path = Path(chunks_path)
        self.production = production
        self.repository_version = repository_version
        self.records: list[dict] = []
        self.validation = self._load()
        if production and not self.validation.production_safe:
            raise ValueError("governed KB snapshot failed production validation")

    def _load(self) -> KbValidationReport:
        seen_ids: set[str] = set()
        hash_failures = ineligible = dup = seen = eligible = 0
        digests: list[str] = []
        with self.path.open("r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, 1):
                if not line.strip():
                    continue
                rec = json.loads(line)
                seen += 1
                missing = self.REQUIRED - rec.keys()
                if missing:
                    raise ValueError(f"{self.path}:{line_no}: missing {sorted(missing)}")
                cid = str(rec["chunk_id"])
                if cid in seen_ids:
                    dup += 1
                seen_ids.add(cid)
                actual = hashlib.sha256(rec["text"].encode("utf-8")).hexdigest()
                if actual != rec["content_hash_sha256"]:
                    hash_failures += 1
                    continue
                is_prod = rec.get("status") == "Approved" and rec.get("effective_for_production") is True
                if self.production and not is_prod:
                    ineligible += 1
                    continue
                rec["_tokens"] = _tokens(rec["text"] + " " + rec.get("title", "") + " " + rec.get("domain", ""))
                self.records.append(rec)
                eligible += 1
                digests.append(cid + ":" + actual)
        snapshot = hashlib.sha256("\n".join(sorted(digests)).encode()).hexdigest()[:20]
        safe = hash_failures == 0 and dup == 0 and (not self.production or eligible > 0)
        return KbValidationReport(seen, eligible, hash_failures, ineligible, dup, safe, snapshot)

    @staticmethod
    def _scope_ok(rec: dict, req: RetrievalRequest) -> bool:
        tenant = rec.get("tenant_id") or rec.get("tenant")
        client = rec.get("client_id") or rec.get("client")
        juris = rec.get("jurisdiction")
        if not all(isinstance(x, str) and x.strip() for x in (tenant, client, juris)):
            return False
        if tenant.lower() != "global" and tenant != req.tenant_id:
            return False
        if client.lower() != "global" and client != req.client_id:
            return False
        if juris.lower() not in ("global", req.jurisdiction.lower()):
            return False
        try:
            effective = date.fromisoformat(rec["effective_date"])
            expires = date.fromisoformat(rec["expiry_date"]) if rec.get("expiry_date") else None
        except (KeyError, TypeError, ValueError):
            return False
        return effective <= req.as_of and (expires is None or req.as_of <= expires)

    def retrieve(self, request: RetrievalRequest) -> RetrievalResponse:
        q = _tokens(request.query)
        wanted = {x.lower() for x in request.knowledge_types}
        scored = []
        for rec in self.records:
            if not self._scope_ok(rec, request):
                continue
            domain = str(rec.get("domain", "")).lower()
            kb_type = str(rec.get("knowledge_type", "")).lower()
            # Knowledge types are soft filters because the controlled repository currently uses domains.
            if wanted and not any(w in domain or w == kb_type for w in wanted):
                if not any(w in ("regulatory", "methodology") for w in wanted):
                    continue
            overlap = len(q & rec["_tokens"])
            if request.product:
                overlap += 2 * len(_tokens(request.product) & rec["_tokens"])
            if request.event:
                overlap += 2 * len(_tokens(request.event) & rec["_tokens"])
            if overlap:
                scored.append((overlap, rec))
        scored.sort(key=lambda x: (-x[0], x[1]["chunk_id"]))
        cites = []
        for _, rec in scored[:request.top_k]:
            text = rec["text"].strip()
            quote = text[:500]
            cites.append(Citation(
                kb="nexus-controlled",
                source=rec.get("title") or rec.get("source_file") or rec["ko_id"],
                section_id=str(rec.get("section") or rec["chunk_id"]),
                version=str(rec.get("version") or self.repository_version),
                quote=quote,
            ))
        warnings = () if cites else ("retrieval_no_relevant_approved_chunk",)
        return RetrievalResponse(tuple(cites), self.validation.snapshot_id,
                                 f"nexus-governed-jsonl-{self.repository_version}", warnings)
