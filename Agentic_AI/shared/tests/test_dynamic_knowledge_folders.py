"""Approval, tenant isolation and automatic folder-discovery regression tests."""
from __future__ import annotations
import hashlib
import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from backend.knowledge.folder_discovery import discover_approved_documents


class FolderDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.folder = self.root / "new-folder" / "new-specialty"
        self.folder.mkdir(parents=True)
        self.data = b"Approved synthetic nausea reaction reference"
        (self.folder / "reference.md").write_bytes(self.data)
        self.manifest = {
            "status": "approved", "approved_by": "test-reviewer", "version": "1",
            "scope": {"tenant_id": "orcimed", "client_id": "hetero"},
            "agent_scope": ["AG02"], "jurisdiction_scope": ["IN"],
            "effective_date": (date.today() - timedelta(days=2)).isoformat(),
            "knowledge_type": "controlled_approved",
            "documents": [{"path": "reference.md", "document_id": "SYN-001",
                           "sha256": hashlib.sha256(self.data).hexdigest()}],
        }
        self.save()
    def save(self):
        (self.folder / "knowledge.manifest.json").write_text(json.dumps(self.manifest))
    def discover(self, **kwargs):
        opts = {"tenant_id": "orcimed", "client_id": "hetero", "agent_id": "AG02",
                "jurisdiction": "IN", "query": "nausea"}
        opts.update(kwargs)
        return discover_approved_documents(self.root, **opts)
    def test_new_folder_is_found_and_content_read(self):
        docs = self.discover()
        self.assertEqual(len(docs), 1)
        self.assertIn("synthetic nausea", docs[0]["content"])
        self.assertEqual(docs[0]["rule_id"], "SYN-001")
    def test_cross_client_and_tenant_rejected(self):
        self.assertEqual(self.discover(client_id="cipla"), [])
        self.assertEqual(self.discover(tenant_id="vigilare"), [])
    def test_other_agent_or_jurisdiction_rejected(self):
        self.assertEqual(self.discover(agent_id="AG03"), [])
        self.assertEqual(self.discover(jurisdiction="US"), [])
    def test_draft_and_tampering_excluded(self):
        self.manifest["status"] = "draft"
        self.save()
        self.assertEqual(self.discover(), [])
        self.manifest["status"] = "approved"
        self.save()
        (self.folder / "reference.md").write_text("Altered clinical fact")
        self.assertEqual(self.discover(), [])
    def test_future_effective_date_rejected(self):
        self.manifest["effective_date"] = (date.today() + timedelta(days=2)).isoformat()
        self.save()
        self.assertEqual(self.discover(), [])
    def test_path_traversal_rejected(self):
        self.manifest["documents"][0]["path"] = "../../secret.md"
        self.save()
        self.assertEqual(self.discover(), [])
    def test_missing_scope_does_not_default_global(self):
        self.manifest["scope"].pop("client_id")
        self.save()
        self.assertEqual(self.discover(), [])

if __name__ == "__main__":
    unittest.main()
