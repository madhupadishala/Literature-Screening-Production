import os
import json
from typing import Dict, Any
from backend.knowledge.agent_context_pack import AgentContextPack
from backend.knowledge.retriever import HybridRetriever

class KnowledgeRouter:
    def __init__(self, base_path: str = None):
        # Anchor absolutely to the real project directory structure
        if base_path is None:
            current_dir = os.path.dirname(os.path.abspath(__file__)) # backend/knowledge
            self.base_path = os.path.dirname(os.path.dirname(current_dir)) # Literature-Screening-Production
            self.base_path = os.path.join(self.base_path, "knowledge")
        else:
            self.base_path = base_path
            
        self.retriever = HybridRetriever(base_path=self.base_path)

    def _load_json_file(self, path: str) -> Dict[str, Any]:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}

    def build_context_pack(self, tenant_id: str, agent_name: str, task: str, evidence_package: Dict[str, Any]) -> AgentContextPack:
        context_pack = AgentContextPack(
            tenant_id=tenant_id,
            agent=agent_name,
            evidence_package_id=evidence_package.get("evidence_package_id", "UNKNOWN")
        )

        title = evidence_package.get("title", "")
        abstract = evidence_package.get("abstract", "")
        text_body = evidence_package.get("text", "")
        search_corpus = f"{title} {abstract} {text_body}".lower()

        # 1. Product Identification Pathing Check
        prod_path = os.path.join(self.base_path, "Products", f"{tenant_id}_product_master.json")
        prod_data = self._load_json_file(prod_path)
        
        for prod in prod_data.get("products", []):
            trade_name = prod.get("trade_name", "").lower()
            aliases = [a.lower() for a in prod.get("aliases", [])]
            ingredients = [i.lower() for i in prod.get("active_ingredients", [])]
            
            if trade_name in search_corpus or any(a in search_corpus for a in aliases) or any(i in search_corpus for i in ingredients):
                context_pack.product_master_matches.append(prod)

        # 2. Country Identification Pathing Check
        dict_path = os.path.join(self.base_path, "Dictionaries", f"{tenant_id}_mah_countries.json")
        dict_data = self._load_json_file(dict_path)
        
        for coi in dict_data.get("countries_of_interest", []):
            c_name = coi.get("name", "").lower()
            c_code = coi.get("country_code", "").lower()
            
            if c_name in search_corpus or f" {c_code} " in f" {search_corpus} ":
                context_pack.mah_country_rules.append(coi)

        # 3. Vector Space Rule Retrieval Check
        retrieved_rules = self.retriever.retrieve_relevant_rules(
            query=search_corpus, 
            agent_name=agent_name, 
            tenant_id=tenant_id
        )

        for rule in retrieved_rules:
            citation = {
                "rule_id": rule["rule_id"],
                "source": f"{rule['source_document']} Sec: {rule['source_section']}"
            }
            context_pack.citations.append(citation)

            if rule["knowledge_type"] == "tenant_override":
                context_pack.client_rules.append(rule)
            else:
                context_pack.general_rules.append(rule)

        return context_pack