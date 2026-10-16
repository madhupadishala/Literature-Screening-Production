"""Offline unit coverage for fail-closed hosted qualification gates.

Does not impersonate hosted Postgres or claim model qualification.
"""
import unittest
from backend.services.pv_agents.native_qualification_runner import (
    review, source, IDS, TENANT, CLIENT, DOC
)

class NativeQualificationContractTests(unittest.TestCase):
    def test_all_five_ts_agents_have_synthetic_source(self):
        self.assertEqual(len(IDS),5)
        for agent in IDS:
            with self.subTest(agent=agent):
                value=source(agent)
                if agent=="AG08":
                    self.assertIsInstance(value,str)
                    self.assertTrue(value.startswith("Synthetic"))
                else:
                    self.assertEqual(value["document_id"],DOC)
                    self.assertIsInstance(value["source"],dict)
    def test_mandatory_review_and_autonomy(self):
        review({"status":"review_required","requires_human_review":True,
                "assessment":{"qualifiedForAutonomousUse":False}})
        for broken in [
            {"status":"completed","requires_human_review":True,"assessment":{}},
            {"status":"review_required","requires_human_review":False,"assessment":{}},
            {"status":"review_required","requires_human_review":True,
             "assessment":{"qualifiedForAutonomousUse":True}},
            {"status":"review_required","requires_human_review":True,
             "assessment":{"qualified_for_autonomous_use":True}},
        ]:
            with self.assertRaises(AssertionError):
                review(broken)
    def test_synthetic_identities_not_real_clients(self):
        self.assertTrue(TENANT.startswith("nexus-staging-"))
        self.assertTrue(CLIENT.startswith("nexus-staging-"))
        self.assertTrue(DOC.startswith("SYNTHETIC-"))

if __name__=="__main__":unittest.main()
