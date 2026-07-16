import os
import re
import json
import chromadb
from typing import Dict, Any, List

class VectorIndexer:
    def __init__(self, base_path: str = None):
        if base_path is None:
            current_dir = os.path.dirname(os.path.abspath(__file__)) # backend/knowledge
            self.base_path = os.path.dirname(os.path.dirname(current_dir)) # Root
            self.base_path = os.path.join(self.base_path, "knowledge")
        else:
            self.base_path = base_path
            
        self.chroma_client = chromadb.PersistentClient(path=os.path.join(self.base_path, "chroma_db"))
        self.collection = self.chroma_client.get_or_create_collection(name="pv_rules_collection")

    def _parse_markdown_file(self, file_path: str) -> Dict[str, Any]:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        frontmatter = {}
        rule_text = ""
        
        match = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)$', content, re.DOTALL)
        if match:
            frontmatter_raw = match.group(1)
            rule_text = match.group(2).strip()
            
            for line in frontmatter_raw.split('\n'):
                if ":" in line:
                    k, v = line.split(":", 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if v.startswith('[') and v.endswith(']'):
                        v = [item.strip().strip('"').strip("'") for item in v[1:-1].split(',')]
                    frontmatter[k] = v
        else:
            rule_text = content.strip()

        frontmatter["rule_text"] = rule_text
        return frontmatter

    def rebuild_index(self, tenant_id: str):
        rules_dir = os.path.join(self.base_path, "Rules")
        clients_dir = os.path.join(self.base_path, "Clients")
        
        all_documents = []
        all_metadatas = []
        all_ids = []

        # 1. Harvest General PV Rules
        if os.path.exists(rules_dir):
            for file in os.listdir(rules_dir):
                if file.endswith(".md"):
                    parsed = self._parse_markdown_file(os.path.join(rules_dir, file))
                    rule_id = parsed.get("rule_id", file)
                    all_ids.append(rule_id)
                    all_documents.append(parsed["rule_text"])
                    all_metadatas.append({
                        "rule_id": rule_id,
                        "domain": str(parsed.get("domain", "")),
                        "knowledge_type": "general_pv",
                        "priority": str(parsed.get("priority", "")),
                        "source_document": str(parsed.get("source_document", "")),
                        "source_section": str(parsed.get("source_section", "")),
                        "override_level": int(parsed.get("override_level", 0)),
                        "tenant_id": "GLOBAL"
                    })

        # 2. Harvest Client Specific Overrides
        tenant_folder = os.path.join(clients_dir, tenant_id)
        if os.path.exists(tenant_folder):
            for file in os.listdir(tenant_folder):
                if file.endswith(".md"):
                    parsed = self._parse_markdown_file(os.path.join(tenant_folder, file))
                    rule_id = parsed.get("rule_id", file)
                    all_ids.append(rule_id)
                    all_documents.append(parsed["rule_text"])
                    all_metadatas.append({
                        "rule_id": rule_id,
                        "domain": str(parsed.get("domain", "")),
                        "knowledge_type": "tenant_override",
                        "priority": str(parsed.get("priority", "")),
                        "source_document": str(parsed.get("source_document", "")),
                        "source_section": str(parsed.get("source_section", "")),
                        "override_level": int(parsed.get("override_level", 100)),
                        "tenant_id": tenant_id
                    })

        # CRITICAL CACHE BUSTING FIX:
        # If IDs exist, delete them first to force Chroma to rewrite the text content blocks fresh
        if all_ids:
            try:
                self.collection.delete(ids=all_ids)
            except Exception:
                pass # Safe catch for blank collection starts
                
            self.collection.upsert(
                ids=all_ids,
                documents=all_documents,
                metadatas=all_metadatas
            )