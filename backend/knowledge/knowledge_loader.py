import os
import re
import yaml
from typing import List
from backend.knowledge.agent_context_pack import AtomicRule

class KnowledgeLoader:
    def __init__(self, base_path: str = "knowledge"):
        self.base_path = base_path

    def parse_markdown_file(self, file_path: str, knowledge_type: str) -> List[AtomicRule]:
        rules = []
        if not os.path.exists(file_path):
            return rules
            
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        chunks = re.split(r'^---+\s*$', content, flags=re.MULTILINE)
        
        for chunk in chunks:
            chunk = chunk.strip()
            if not chunk:
                continue
                
            if ":" in chunk and ("rule_id" in chunk or "domain" in chunk):
                try:
                    parts = chunk.split("\n\n", 1)
                    yaml_part = parts[0]
                    text_part = parts[1] if len(parts) > 1 else ""
                    
                    metadata = yaml.safe_load(yaml_part)
                    
                    rule = AtomicRule(
                        rule_id=metadata.get("rule_id", "UNKNOWN"),
                        domain=metadata.get("domain", "general"),
                        module=metadata.get("module", "literature_screening"),
                        knowledge_type=knowledge_type,
                        priority=metadata.get("priority", "medium"),
                        effective_date=str(metadata.get("effective_date", "2026-07-04")),
                        source_document=metadata.get("source_document", "UNKNOWN"),
                        source_section=metadata.get("source_section", "UNKNOWN"),
                        version=metadata.get("version", "1.0.0"),
                        agent_scope=metadata.get("agent_scope", []),
                        country_scope=metadata.get("country_scope", ["GLOBAL"]),
                        product_scope=metadata.get("product_scope", ["ALL"]),
                        override_level=int(metadata.get("override_level", 0)),
                        rule_text=text_part.strip() if text_part else metadata.get("rule", "")
                    )
                    rules.append(rule)
                except Exception:
                    continue
        return rules

    def load_all_rules(self, tenant_id: str = None) -> List[AtomicRule]:
        all_rules = []
        
        # 1. Load General Rules from knowledge/Rules/
        rules_dir = os.path.join(self.base_path, "Rules")
        if os.path.exists(rules_dir):
            for file in os.listdir(rules_dir):
                if file.endswith(".md"):
                    all_rules.extend(self.parse_markdown_file(os.path.join(rules_dir, file), "general_pv"))
                    
        # 2. Load Tenant/Client Rules from knowledge/Clients/{tenant_id}/
        if tenant_id:
            client_dir = os.path.join(self.base_path, "Clients", tenant_id)
            if os.path.exists(client_dir):
                for file in os.listdir(client_dir):
                    if file.endswith(".md"):
                        all_rules.extend(self.parse_markdown_file(os.path.join(client_dir, file), "tenant_override"))
                        
        return all_rules