"""Database-backed Nexus rule-store smoke tests.

Use NEXUS_CLINICAL_RULE_TEST_DSN for a *restricted-reader* Neon URL.
These tests never seed or approve rules and are safe against a draft-only DB.
"""
import os
import unittest
from backend.knowledge.clinical_rule_store import ClinicalRuleError, RuleScope
from backend.knowledge.postgres_clinical_rule_store import PostgresClinicalRuleStore
from backend.knowledge.knowledge_router import KnowledgeRouter

class PostgresRuleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        dsn=os.getenv("NEXUS_CLINICAL_RULE_TEST_DSN")
        if not dsn:
            raise unittest.SkipTest("NEXUS_CLINICAL_RULE_TEST_DSN not configured")
        try:
            import psycopg
        except ImportError as exc:
            raise unittest.SkipTest("psycopg not installed") from exc
        cls.db=PostgresClinicalRuleStore(lambda: psycopg.connect(dsn,connect_timeout=8))

    def test_router_fails_closed_for_draft_inventory(self):
        router=object.__new__(KnowledgeRouter)
        result=router.evaluate_clinical_rule(rule_store=self.db,
             tenant_id="validation_tenant",client_id="validation_client",
             jurisdiction="IN",agent_name="adverse_event_extraction",
             as_of="2026-10-10",rule_id="AE-002",facts={"explicit_ae":True})
        self.assertEqual(result["state"],"NO_APPROVED_RULE")

    def test_tenant_changes_cannot_expose_unapproved_rules(self):
        for tenant in ("validation_tenant","other_tenant"):
            scope=RuleScope(tenant,"client_A","IN","adverse_event_extraction","2026-10-10")
            self.assertIsNone(self.db.resolve(scope,"AE-002"))

    def test_owner_connection_is_rejected(self):
        owner_dsn=os.getenv("NEXUS_CLINICAL_RULE_OWNER_TEST_DSN")
        if not owner_dsn:
            self.skipTest("Owner diagnostic DSN not configured")
        import psycopg
        unsafe=PostgresClinicalRuleStore(lambda: psycopg.connect(owner_dsn,connect_timeout=8))
        with self.assertRaises(ClinicalRuleError):
            unsafe.resolve(RuleScope("tenant","client","IN","adverse_event_extraction","2026-10-10"),"AE-002")

if __name__=="__main__":
    unittest.main()
