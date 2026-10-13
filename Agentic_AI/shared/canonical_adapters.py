"""AG01 canonical runtime uses authenticated Nexus controlled knowledge packs.

The Next.js knowledge service owns PostgreSQL/pgvector retrieval. No local JSON
Product Master or Chroma fallback is permitted here.
"""
from __future__ import annotations
from types import SimpleNamespace
from typing import Any
import re

from .module_dispatch import AgentExecution


def drug_extraction_adapter(context: AgentExecution, payload: Any) -> dict:
    if not isinstance(payload, dict) or not isinstance(payload.get("text"), str):
        raise ValueError("AG01 expects text evidence")
    knowledge = payload.get("governed_knowledge")
    if not isinstance(knowledge, dict) or knowledge.get("tenant_id") != context.tenant_id:
        raise ValueError("AG01 requires matching tenant controlled knowledge")
    manifest = knowledge.get("manifest_sha256")
    if not isinstance(manifest, str) or not re.fullmatch(r"[a-f0-9]{64}", manifest):
        raise ValueError("AG01 requires controlled manifest SHA256")
    if knowledge.get("client_id") != context.client_id:
        raise ValueError("AG01 client scope mismatch")
    products = knowledge.get("products")
    if not isinstance(products, list) or len(products) > 500:
        raise ValueError("AG01 requires governed Product Master array")
    for product in products:
        if not isinstance(product, dict) or not all(isinstance(product.get(k), str) for k in ("product_id", "trade_name", "source_document_key")):
            raise ValueError("Invalid governed product row")
        for key in ("aliases", "active_ingredients"):
            if not isinstance(product.get(key), list) or not all(isinstance(v, str) for v in product[key]):
                raise ValueError("Invalid governed product aliases")
    citations = knowledge.get("citations")
    if not isinstance(citations, list) or len(citations) > 30:
        raise ValueError("AG01 requires controlled citation array")
    for citation in citations:
        if not isinstance(citation, dict) or not all(
            isinstance(citation.get(key), str)
            for key in ("citationId", "repositoryManifestSha256")
        ) or citation["repositoryManifestSha256"] != manifest:
            raise ValueError("Invalid or mixed knowledge manifest citations")

    class GovernedContextRouter:
        def build_context_pack(self, **kwargs):
            if kwargs.get("tenant_id") != context.tenant_id or kwargs.get("client_id") != context.client_id:
                raise ValueError("AG01 knowledge scope mismatch")
            return SimpleNamespace(
                # No inferred company ownership until exact client Product Master
                # is integrated as a separate authorized, structured lookup.
                product_master_matches=products,
                citations=[
                    {"rule_id": c["citationId"], "source": c.get("sourceFile", "")}
                    for c in citations
                ],
                to_dict=lambda: {"manifest_sha256": manifest, "citations": citations},
            )

    from Agentic_AI.AG01_Drug_Extraction_Classification.src.backend.nexus_agent import NexusDrugRoleAgent
    result = NexusDrugRoleAgent(knowledge_router=GovernedContextRouter()).run(
        tenant_id=context.tenant_id,
        client_id=context.client_id,
        evidence_package={
            "case_id": context.document_id,
            "evidence_package_id": context.workflow_id,
            "text": payload["text"],
            "source_type": payload.get("source_type", "unknown"),
        },
    )
    if not isinstance(result, dict):
        raise ValueError("AG01 returned invalid output")
    result["review_required"] = True
    result["knowledge_context"]["repository_manifest_sha256"] = manifest
    result["knowledge_context"]["retrieval_backend"] = "nexus-controlled-postgres"
    result["knowledge_context"]["client_product_master_status"] = "governed_exact_workspace_matches"
    return result


CANONICAL_ADAPTERS = {"AG01": drug_extraction_adapter}


def register_verified_adapter(registry: dict, agent_id: str, adapter) -> None:
    if agent_id not in {f"AG{i:02}" for i in range(1, 28)}:
        raise ValueError("Unknown agent ID")
    if not callable(adapter):
        raise TypeError("Adapter must be callable")
    if agent_id in registry:
        raise ValueError("Agent already registered")
    registry[agent_id] = adapter
