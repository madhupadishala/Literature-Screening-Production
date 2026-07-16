from dataclasses import dataclass, field
from typing import List, Dict, Any

@dataclass
class AtomicRule:
    rule_id: str
    domain: str
    module: str
    knowledge_type: str
    priority: str
    effective_date: str
    source_document: str
    source_section: str
    version: str
    agent_scope: List[str]
    country_scope: List[str]
    product_scope: List[str]
    override_level: int
    rule_text: str

@dataclass
class AgentContextPack:
    tenant_id: str
    agent: str
    evidence_package_id: str
    general_rules: List[Dict[str, Any]] = field(default_factory=list)
    client_rules: List[Dict[str, Any]] = field(default_factory=list)
    product_master_matches: List[Dict[str, Any]] = field(default_factory=list)
    mah_country_rules: List[Dict[str, Any]] = field(default_factory=list)
    decision_constraints: List[Dict[str, Any]] = field(default_factory=list)
    citations: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "agent": self.agent,
            "evidence_package_id": self.evidence_package_id,
            "general_rules": self.general_rules,
            "client_rules": self.client_rules,
            "product_master_matches": self.product_master_matches,
            "mah_country_rules": self.mah_country_rules,
            "decision_constraints": self.decision_constraints,
            "citations": self.citations
        }