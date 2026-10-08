import os
import json
import re
from datetime import date
from typing import Dict, Any
from backend.knowledge.agent_context_pack import AgentContextPack
from backend.knowledge.retriever import HybridRetriever

class KnowledgeRouter:
    def __init__(self, base_path: str = None, retriever=None):
        # Anchor absolutely to the real project directory structure
        if base_path is None:
            current_dir = os.path.dirname(os.path.abspath(__file__)) # backend/knowledge
            self.base_path = os.path.dirname(os.path.dirname(current_dir)) # Literature-Screening-Production
            self.base_path = os.path.join(self.base_path, "knowledge")
        else:
            self.base_path = base_path
            
        self.retriever = retriever or HybridRetriever(base_path=self.base_path)

    def _load_json_file(self, path: str) -> Dict[str, Any]:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}

    def build_context_pack(self, tenant_id: str, agent_name: str, task: str, evidence_package: Dict[str, Any], *, client_id=None, knowledge_types=None, jurisdiction=None, as_of=None) -> AgentContextPack:
        for identifier in (tenant_id, client_id):
            if identifier is not None and (not isinstance(identifier, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", identifier)):
                raise ValueError("Invalid tenant/client scope identifier")
        if not tenant_id or tenant_id == "GLOBAL":
            raise ValueError("An actual tenant_id is required")
        effective_on = date.fromisoformat(str(as_of)) if as_of else None
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
            product_client = prod.get("client_id", prod_data.get("client_id"))
            if product_client not in ((client_id, "GLOBAL") if client_id else ("GLOBAL",)):
                continue
            if jurisdiction and jurisdiction not in prod.get("country_scope", ["GLOBAL"]):
                if "GLOBAL" not in prod.get("country_scope", []):
                    continue
            if effective_on:
                try:
                    if date.fromisoformat(prod["effective_date"]) > effective_on:
                        continue
                    if prod.get("expiry_date") and date.fromisoformat(prod["expiry_date"]) < effective_on:
                        continue
                except (KeyError, ValueError):
                    continue
            trade_name = prod.get("trade_name", "").lower()
            aliases = [a.lower() for a in prod.get("aliases", [])]
            ingredients = [i.lower() for i in prod.get("active_ingredients", [])]
            
            if any(value and re.search(r"(?<!\w)" + re.escape(value) + r"(?!\w)", search_corpus) for value in [trade_name, *aliases, *ingredients]):
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
            tenant_id=tenant_id,
            client_id=client_id, knowledge_types=knowledge_types, jurisdiction=jurisdiction, as_of=as_of
        )

        for rule in retrieved_rules:
            citation = {
                "rule_id": rule["rule_id"],
                "source": f"{rule.get('source_document', 'UNKNOWN')} Sec: {rule.get('source_section', 'UNKNOWN')}"
            }
            context_pack.citations.append(citation)

            if rule["knowledge_type"] == "tenant_override":
                context_pack.client_rules.append(rule)
            else:
                context_pack.general_rules.append(rule)

        return context_pack