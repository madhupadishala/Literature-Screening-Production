from typing import Any, Dict
from datetime import date
import hashlib
import json

from backend.knowledge.knowledge_router import KnowledgeRouter
from .orchestrator import DrugRoleOrchestrator


class NexusDrugRoleAgent:
    """Nexus integration wrapper for the core DrugRoleOrchestrator."""

    AGENT_NAME = "drug_role_classification"

    def __init__(self, knowledge_router: KnowledgeRouter = None):
        self.knowledge_router = knowledge_router or KnowledgeRouter()
        self.engine = DrugRoleOrchestrator()

    def run(
        self,
        tenant_id: str,
        evidence_package: Dict[str, Any],
        candidate_drugs=None,
        normalization_map=None,
        known_non_company_products=None,
        client_id=None,
    ) -> Dict[str, Any]:
        context_pack = self.knowledge_router.build_context_pack(
            tenant_id=tenant_id,
            agent_name=self.AGENT_NAME,
            task="Extract medicinal products and classify clinical role and product ownership.",
            evidence_package=evidence_package,
            client_id=client_id,
            as_of=date.today(),
        )

        text = " ".join(
            part for part in (
                evidence_package.get("title", ""),
                evidence_package.get("abstract", ""),
                evidence_package.get("text", ""),
            ) if part
        )

        result = self.engine.classify(
            case_id=evidence_package.get("case_id") or evidence_package.get("evidence_package_id", "UNKNOWN"),
            tenant_id=tenant_id,
            source_type=evidence_package.get("source_type", "unknown"),
            text=text,
            candidate_drugs=candidate_drugs,
            normalization_map=normalization_map,
            company_products=context_pack.product_master_matches,
            known_non_company_products=known_non_company_products,
        )

        payload = result.to_dict()
        payload["knowledge_context"] = {
            "citations": context_pack.citations,
            "matched_company_products": context_pack.product_master_matches,
            "agent": self.AGENT_NAME,
            "version": "unqualified-nexus-knowledge-router-v2-scoped",
            "snapshot_sha256": hashlib.sha256(json.dumps(context_pack.to_dict() if hasattr(context_pack, "to_dict") else {"citations": context_pack.citations, "products": context_pack.product_master_matches}, sort_keys=True).encode()).hexdigest(),
        }
        return payload
