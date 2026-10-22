"""End-to-end scoped knowledge-pack regression for newly created folders."""
from __future__ import annotations
import hashlib
import hmac
import json
from unittest.mock import patch
import tempfile
import unittest
from pathlib import Path
from backend.knowledge.knowledge_router import KnowledgeRouter

class EmptyRetriever:
    def retrieve_relevant_rules(self, **kwargs):
        return []

class FolderRouterTests(unittest.TestCase):
    def test_new_folder_is_visible_immediately_in_correct_client_only(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            router = KnowledgeRouter(base_path=temp, retriever=EmptyRetriever())
            args = dict(tenant_id="orcimed", client_id="hetero", agent_name="AG12",
                        task="expectedness", evidence_package={
                            "document_id": "DOC-1", "evidence_package_id": "DOC-1",
                            "text": "synthetic nausea listed in controlled reference"})
            before = router.build_context_pack(**args)
            self.assertEqual(before.approved_documents, [])
            folder = root / "New_Medical_Domain" / "Future_Folder"
            folder.mkdir(parents=True)
            body = b"synthetic nausea listed in controlled reference"
            (folder / "approved.md").write_bytes(body)
            manifest = {
                "status": "approved", "approved_by": "qa-reviewer",
                "version": "2026.10", "knowledge_type": "labeling",
                "scope": {"tenant_id": "orcimed", "client_id": "hetero"},
                "agent_scope": ["AG12"], "jurisdiction_scope": ["GLOBAL"],
                "effective_date": "2026-01-01",
                "documents": [{"path":"approved.md", "document_id":"LAB-1",
                               "sha256": hashlib.sha256(body).hexdigest()}],
            }
            signed = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
            manifest["approval_signature"] = hmac.new(b"synthetic-test-only-key", signed, hashlib.sha256).hexdigest()
            (folder / "knowledge.manifest.json").write_text(json.dumps(manifest))
            with patch.dict("os.environ", {"NEXUS_KNOWLEDGE_MANIFEST_SECRET": "synthetic-test-only-key"}):
                after = router.build_context_pack(**args)
                self.assertEqual(len(after.approved_documents), 1)
                self.assertEqual(after.approved_documents[0]["content"], body.decode())
                other = router.build_context_pack(**{**args, "client_id": "cipla"})
                self.assertEqual(other.approved_documents, [])
                other_agent = router.build_context_pack(**{**args, "agent_name": "AG11"})
                self.assertEqual(other_agent.approved_documents, [])
if __name__ == "__main__":
    unittest.main()
