"""Nexus KnowledgeRouter adapter for the Causality Agent.

This module is intentionally narrow: the causality service asks for governed context;
the existing Nexus KnowledgeRouter remains the production owner of tenant filtering,
product-master lookup and rule retrieval.

The adapter never turns a retrieval miss into a negative clinical fact.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from backend.knowledge.knowledge_router import KnowledgeRouter


@dataclass(frozen=True)
class CausalityKnowledgeRequest:
    tenant_id: str
    client_id: str | None
    query: str
    knowledge_types: tuple[str, ...]
    jurisdiction: str
    as_of: date
    product: str | None = None
    event: str | None = None


@dataclass(frozen=True)
class CausalityCitation:
    record_id: str
    title: str
    text: str
    source: str
    version: str | None
    metadata: dict[str, Any]


@dataclass(frozen=True)
class CausalityKnowledgeResponse:
    citations: tuple[CausalityCitation, ...]
    retrieval_version: str
    warnings: tuple[str, ...] = ()


class NexusCausalityKnowledgeAdapter:
    """Bridge the existing KnowledgeRouter to the causality service contract."""

    RETRIEVAL_VERSION = "nexus-knowledge-router-v1"

    def __init__(self, router: KnowledgeRouter | None = None):
        self.router = router or KnowledgeRouter()

    def retrieve(self, req: CausalityKnowledgeRequest) -> CausalityKnowledgeResponse:
        evidence_package = {
            "evidence_package_id": "CAUSALITY-CONTEXT",
            "title": f"{req.product or ''} {req.event or ''}".strip(),
            "abstract": req.query,
            "text": req.query,
        }
        pack = self.router.build_context_pack(
            tenant_id=req.tenant_id,
            agent_name="causality",
            task="drug-event causality assessment",
            evidence_package=evidence_package,
        )

        rows: list[CausalityCitation] = []
        seen: set[str] = set()

        for rule in [*pack.client_rules, *pack.general_rules]:
            rid = str(rule.get("rule_id") or "")
            if not rid or rid in seen:
                continue
            seen.add(rid)
            rows.append(
                CausalityCitation(
                    record_id=rid,
                    title=str(rule.get("domain") or rid),
                    text=str(rule.get("rule_text") or ""),
                    source=f"{rule.get('source_document') or 'Nexus KB'} Sec: {rule.get('source_section') or 'N/A'}",
                    version=str(rule.get("version")) if rule.get("version") is not None else None,
                    metadata={
                        "knowledge_type": rule.get("knowledge_type"),
                        "priority": rule.get("priority"),
                        "override_level": rule.get("override_level"),
                        "tenant_id": req.tenant_id,
                        "client_id": req.client_id,
                        "jurisdiction": req.jurisdiction,
                    },
                )
            )

        for product in pack.product_master_matches:
            rid = f"product:{product.get('product_id') or product.get('trade_name') or 'unknown'}"
            if rid in seen:
                continue
            seen.add(rid)
            rows.append(
                CausalityCitation(
                    record_id=rid,
                    title=str(product.get("trade_name") or product.get("product_id") or "Product master"),
                    text=str(product),
                    source="Nexus Client Product Master",
                    version=None,
                    metadata={"knowledge_type": "product_master", "tenant_id": req.tenant_id},
                )
            )

        warnings: list[str] = []
        if not rows:
            warnings.append("retrieval_miss_unknown_not_negative")

        return CausalityKnowledgeResponse(
            citations=tuple(rows),
            retrieval_version=self.RETRIEVAL_VERSION,
            warnings=tuple(warnings),
        )
