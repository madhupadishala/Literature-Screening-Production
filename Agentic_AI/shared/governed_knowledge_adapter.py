"""Reusable Nexus-governed Knowledge Base execution contract for AG01–AG27.

Knowledge retrieval happens in authenticated Nexus (Postgres/pgvector); this
worker must never retrieve tenant knowledge from local demo JSON or Chroma.
"""
from __future__ import annotations
import re
from typing import Any

AGENT_IDS = frozenset(f"AG{i:02}" for i in range(1, 28))

class GovernedKnowledgeError(ValueError):
    pass

def validate_governed_pack(execution: Any, payload: Any) -> dict:
    if execution.agent_id not in AGENT_IDS:
        raise GovernedKnowledgeError("unknown agent")
    if not isinstance(payload, dict):
        raise GovernedKnowledgeError("payload must be an object")
    knowledge = payload.get("governed_knowledge")
    if not isinstance(knowledge, dict):
        raise GovernedKnowledgeError("missing Nexus-controlled knowledge")
    if (knowledge.get("tenant_id") != execution.tenant_id or
            knowledge.get("client_id") != execution.client_id):
        raise GovernedKnowledgeError("tenant/client knowledge mismatch")
    manifest = knowledge.get("manifest_sha256")
    if not isinstance(manifest, str) or not re.fullmatch("[0-9a-f]{64}", manifest):
        raise GovernedKnowledgeError("missing controlled repository manifest")
    citations = knowledge.get("citations")
    if not isinstance(citations, list) or len(citations) > 30:
        raise GovernedKnowledgeError("invalid controlled citations")
    for c in citations:
        if (not isinstance(c, dict) or
                not isinstance(c.get("citationId"), str) or
                c.get("repositoryManifestSha256") != manifest):
            raise GovernedKnowledgeError("mixed/unverifiable repository citations")
    products = knowledge.get("products")
    if not isinstance(products, list) or len(products) > 500:
        raise GovernedKnowledgeError("missing governed client product list")
    for product in products:
        if (not isinstance(product, dict) or
                not all(isinstance(product.get(k), str) for k in
                        ("product_id", "trade_name", "source_document_key")) or
                not all(isinstance(product.get(k), list) and
                        all(isinstance(v, str) for v in product[k])
                        for k in ("aliases", "active_ingredients"))):
            raise GovernedKnowledgeError("invalid governed product")
    # Any extra retrieved passages must be accompanied by source citations.
    passages = knowledge.get("passages", [])
    if not isinstance(passages, list) or len(passages) > 30:
        raise GovernedKnowledgeError("invalid governed passages")
    known_ids = {c["citationId"] for c in citations}
    for p in passages:
        if (not isinstance(p, dict) or
                p.get("citationId") not in known_ids or
                not isinstance(p.get("text"), str) or len(p["text"]) > 6000):
            raise GovernedKnowledgeError("unverified knowledge passage")
    return knowledge

def governed_context(execution: Any, payload: dict) -> dict:
    k = validate_governed_pack(execution, payload)
    return {
        "tenant_id": execution.tenant_id,
        "client_id": execution.client_id,
        "repository_manifest_sha256": k["manifest_sha256"],
        "citations": k["citations"],
        "knowledge_passages": k.get("passages", []),
        "products": [p["trade_name"] for p in k["products"]],
        "client_products": k["products"],
        "source_type": payload.get("source_type", "unknown"),
    }
