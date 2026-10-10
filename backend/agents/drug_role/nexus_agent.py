from typing import Any, Dict
from datetime import date
import hashlib
import json

from backend.knowledge.knowledge_router import KnowledgeRouter
from .orchestrator import DrugRoleOrchestrator
from .exposure_policy import normalize_product_exposures
from .indication_action_policy import normalize_indications_actions
from backend.knowledge.clinical_decision_adapters import NexusClinicalDecisionAdapter


class NexusDrugRoleAgent:
    """Nexus integration wrapper for the core DrugRoleOrchestrator."""

    AGENT_NAME = "drug_role_classification"

    def __init__(self, knowledge_router: KnowledgeRouter = None, mention_extractor=None):
        self.knowledge_router = knowledge_router or KnowledgeRouter()
        self.engine = DrugRoleOrchestrator()
        self.mention_extractor = mention_extractor

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

        if candidate_drugs is None and self.mention_extractor is not None:
            candidate_drugs = self.mention_extractor.extract_names(text)

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
        # Explicit validated source-extraction evidence only; never invent regimens
        # from narrative dates/route or bypass upstream clinical extraction.
        if evidence_package.get("validated_drug_exposures") is not None:
            payload["exposure_products"] = normalize_product_exposures(evidence_package["validated_drug_exposures"])
            payload["exposure_policy_rules"] = ["DR-004", "DR-005", "DR-006", "DR-007", "DR-008", "DR-011"]
        if evidence_package.get("validated_drug_indications_actions") is not None:
            payload["indications_actions"] = normalize_indications_actions(
                evidence_package["validated_drug_indications_actions"])
            payload["indication_action_policy_rules"] = ["ACT-001"]
        # Shared Nexus Step 2.6–2.10 contract: only explicitly validated facts.
        # No synthetic or inferred clinical assertions enter this interface.
        if evidence_package.get("validated_shared_clinical_packet") is not None:
            packet = evidence_package["validated_shared_clinical_packet"]
            if packet.get("case_id") != payload["case_id"]:
                raise ValueError("Shared clinical packet case_id must match drug agent case")
            if not client_id:\n                raise ValueError("client_id required for shared clinical decisions")\n            payload["shared_clinical_packet"] = NexusClinicalDecisionAdapter("shared_clinical_services").run(tenant_id=tenant_id, client_id=client_id, packet=packet)
        payload["knowledge_context"] = {
            "citations": context_pack.citations,
            "matched_company_products": context_pack.product_master_matches,
            "agent": self.AGENT_NAME,
            "version": "unqualified-nexus-knowledge-router-v2-scoped",
            "snapshot_sha256": hashlib.sha256(json.dumps(context_pack.to_dict() if hasattr(context_pack, "to_dict") else {"citations": context_pack.citations, "products": context_pack.product_master_matches}, sort_keys=True).encode()).hexdigest(),
        }
        return payload
