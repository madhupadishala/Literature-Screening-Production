"""Governed vector retrieval. Authorization scope is applied before similarity search."""
import os
from datetime import date
from typing import Any, Dict, List


class HybridRetriever:
    def __init__(self, base_path: str = "knowledge", collection=None):
        self.base_path = base_path
        self._collection = collection

    @property
    def collection(self):
        if self._collection is None:
            try:
                import chromadb
            except ImportError as exc:
                raise RuntimeError("Install requirements-agents.txt before using vector retrieval") from exc
            client = chromadb.PersistentClient(path=os.path.join(self.base_path, "chroma_db"))
            # Do not silently create an empty production knowledge index.
            self._collection = client.get_collection(name="pv_rules_collection")
        return self._collection

    def retrieve_relevant_rules(self, query: str, agent_name: str, tenant_id: str,
                               limit: int = 10, client_id=None, knowledge_types=None,
                               jurisdiction=None, as_of=None) -> List[Dict[str, Any]]:
        if not tenant_id or tenant_id == "GLOBAL":
            raise ValueError("An actual tenant_id is required")
        if limit < 1 or limit > 100:
            raise ValueError("limit must be between 1 and 100")
        effective_on = date.fromisoformat(str(as_of)) if as_of else None
        tenant_filter = {"$and": [{"tenant_id": tenant_id}, {"client_id": {"$in": [client_id or "GLOBAL", "GLOBAL"]}}]}
        where = {"$or": [{"tenant_id": "GLOBAL"}, tenant_filter]}
        if knowledge_types:
            where = {"$and": [where, {"knowledge_type": {"$in": list(knowledge_types)}}]}
        results = self.collection.query(query_texts=[query], n_results=limit,
                                        where=where, include=["metadatas", "documents"])
        if not results or not results.get("ids") or not results["ids"][0]:
            return []
        output = []
        for rid, meta, text in zip(results["ids"][0], results["metadatas"][0], results["documents"][0]):
            meta = meta or {}
            # Defense in depth for an incorrectly configured vector provider.
            if meta.get("tenant_id") not in (tenant_id, "GLOBAL"):
                continue
            if meta.get("tenant_id") != "GLOBAL" and meta.get("client_id") not in (client_id or "GLOBAL", "GLOBAL"):
                continue
            if knowledge_types and meta.get("knowledge_type") not in knowledge_types:
                continue
            scopes = str(meta.get("agent_scope", "")).split(",")
            if agent_name not in scopes and "GLOBAL" not in scopes:
                continue
            countries = str(meta.get("country_scope", "")).split(",")
            if jurisdiction and jurisdiction not in countries and "GLOBAL" not in countries:
                continue
            if effective_on:
                # Missing/unparseable validity is unknown, not current approved knowledge.
                try:
                    start = date.fromisoformat(str(meta["effective_date"]))
                    end = date.fromisoformat(str(meta["expiry_date"])) if meta.get("expiry_date") else None
                except (ValueError, KeyError):
                    continue
                if start > effective_on or (end and effective_on > end):
                    continue
            output.append({**meta, "rule_id": meta.get("rule_id") or rid, "rule_text": text})
        return output
