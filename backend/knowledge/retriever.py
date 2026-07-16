import os
import chromadb
from typing import Dict, Any, List

class HybridRetriever:
    def __init__(self, base_path: str = "knowledge"):
        self.chroma_client = chromadb.PersistentClient(path=os.path.join(base_path, "chroma_db"))
        self.collection = self.chroma_client.get_or_create_collection(name="pv_rules_collection")

    def retrieve_relevant_rules(self, query: str, agent_name: str, tenant_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        # Fetch records using content query string
        results = self.collection.query(
            query_texts=[query],
            n_results=limit
        )
        
        formatted_rules = []
        if not results or not results.get("ids") or len(results["ids"][0]) == 0:
            return formatted_rules

        # Re-map primitive records alongside their dynamic content values
        ids = results["ids"][0]
        metadatas = results["metadatas"][0]
        documents = results["documents"][0]

        for i in range(len(ids)):
            meta = metadatas[i]
            doc_text = documents[i]
            
            # Global baseline or direct tenant filtering compliance check pass
            if meta.get("tenant_id") == "GLOBAL" or meta.get("tenant_id") == tenant_id:
                rule_entry = {
                    "rule_id": meta.get("rule_id"),
                    "domain": meta.get("domain"),
                    "knowledge_type": meta.get("knowledge_type"),
                    "priority": meta.get("priority"),
                    "source_document": meta.get("source_document"),
                    "source_section": meta.get("source_section"),
                    "override_level": meta.get("override_level"),
                    "rule_text": doc_text # Grounding text text injected
                }
                formatted_rules.append(rule_entry)

        return formatted_rules