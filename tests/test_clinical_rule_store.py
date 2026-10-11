"""Task 2.2 deterministic policy-store regression tests."""
import tempfile
import unittest
from pathlib import Path
from backend.knowledge.clinical_rule_store import (
    ClinicalRuleStore, ClinicalRuleError, RuleScope, evaluate_decision_table,
)

TABLE = {"clauses": [
    {"when": [{"field": "explicit_ae", "op": "eq", "value": True}], "decision": "EXTRACT"},
], "on_no_match": "NO_AUTOMATIC_EVENT"}


class ClinicalRuleStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = ClinicalRuleStore(Path(self.temp.name) / "rules.sqlite3")
        self.scope = RuleScope("tenant_A", "client_A", "IN", "adverse_event_extraction", "2026-10-09")

    def tearDown(self):
        self.temp.cleanup()

    def add(self, **override):
        args = dict(rule_id="AE-002", version=1, owner_agent="adverse_event_extraction",
                    domain="ae", scope="NEXUS", status="DRAFT",
                    rule_text="Never infer an AE from standalone lab values",
                    decision_table=TABLE, references=[{"document": "Nexus Expert Clinical Specification"}],
                    effective_from="2026-01-01")
        args.update(override)
        return self.store.add_revision(**args)

    def test_inventory_import_is_draft_only_and_idempotent(self):
        import json
        inventory_path = Path(__file__).resolve().parents[1] / "docs" / "agents" / "step-02" / "clinical_rule_traceability.json"
        inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
        first = self.store.import_inventory_drafts(inventory)
        self.assertEqual(first["inserted"], 35)
        self.assertEqual(first["activated"], 0)
        second = self.store.import_inventory_drafts(inventory)
        self.assertEqual(second["already_present"], 35)
        self.assertEqual(self.store.decide(self.scope, "AE-002", {"explicit_ae": True})["state"], "NO_APPROVED_RULE")

    def test_router_uses_explicit_scoped_store(self):
        from backend.knowledge.knowledge_router import KnowledgeRouter
        self.add(status="APPROVED", scope="CLIENT", tenant_id="tenant_A", client_id="client_A")
        router = object.__new__(KnowledgeRouter)
        answer = router.evaluate_clinical_rule(rule_store=self.store,
            tenant_id="tenant_A", client_id="client_A", jurisdiction="IN",
            agent_name="adverse_event_extraction", as_of="2026-10-09",
            rule_id="AE-002", facts={"explicit_ae": True})
        self.assertEqual(answer["decision"], "EXTRACT")
        unauthorized = router.evaluate_clinical_rule(rule_store=self.store,
            tenant_id="tenant_A", client_id="client_B", jurisdiction="IN",
            agent_name="adverse_event_extraction", as_of="2026-10-09",
            rule_id="AE-002", facts={"explicit_ae": True})
        self.assertEqual(unauthorized["state"], "NO_APPROVED_RULE")

    def test_draft_rule_is_not_executable(self):
        self.add()
        self.assertEqual(self.store.decide(self.scope, "AE-002", {"explicit_ae": True})["state"], "NO_APPROVED_RULE")

    def test_approved_rule_executes_and_missing_data_fail_closed(self):
        digest = self.add(status="APPROVED")
        self.assertEqual(self.store.decide(self.scope, "AE-002", {"explicit_ae": True})["decision"], "EXTRACT")
        self.assertEqual(self.store.decide(self.scope, "AE-002", {"temperature": 103})["decision"], "NO_AUTOMATIC_EVENT")
        self.assertEqual(self.store.resolve(self.scope, "AE-002")["checksum"], digest)

    def test_client_specific_rule_cannot_leak(self):
        self.add(scope="CLIENT", status="APPROVED", tenant_id="tenant_A", client_id="client_A")
        other = RuleScope("tenant_A", "client_B", "IN", "adverse_event_extraction", "2026-10-09")
        self.assertIsNone(self.store.resolve(other, "AE-002"))

    def test_client_policy_overrides_nexus_when_approved(self):
        self.add(status="APPROVED")
        override_table = {"clauses": [{"when": [{"field": "explicit_ae", "op": "eq", "value": True}],
                                       "decision": "REVIEW"}], "on_no_match": "NO_AUTOMATIC_EVENT"}
        self.add(rule_id="AE-002", version=2, status="APPROVED", scope="CLIENT",
                 tenant_id="tenant_A", client_id="client_A", decision_table=override_table)
        self.assertEqual(self.store.decide(self.scope, "AE-002", {"explicit_ae": True})["decision"], "REVIEW")
        other = RuleScope("tenant_B", "client_B", "IN", "adverse_event_extraction", "2026-10-09")
        self.assertEqual(self.store.decide(other, "AE-002", {"explicit_ae": True})["decision"], "EXTRACT")

    def test_agent_jurisdiction_and_dates_are_scoped(self):
        self.add(status="APPROVED", jurisdiction="US", effective_from="2026-10-01")
        self.assertIsNone(self.store.resolve(self.scope, "AE-002"))
        self.assertIsNotNone(self.store.resolve(RuleScope("tenant_A","client_A","US","adverse_event_extraction","2026-10-09"), "AE-002"))
        self.assertIsNone(self.store.resolve(RuleScope("tenant_A","client_A","US","drug_extraction","2026-10-09"), "AE-002"))

    def test_duplicate_revision_rejected_and_not_overwritten(self):
        self.add()
        with self.assertRaises(Exception):
            self.add()

    def test_no_arbitrary_expression_or_missing_fact_inference(self):
        with self.assertRaises(ClinicalRuleError):
            evaluate_decision_table({"clauses":[{"when":[{"field":"x.__class__","op":"eq","value":1}],
               "decision":"X"}],"on_no_match":"UNKNOWN"}, {})
        self.assertEqual(evaluate_decision_table(TABLE, {})["decision"], "NO_AUTOMATIC_EVENT")


if __name__ == "__main__":
    unittest.main()
