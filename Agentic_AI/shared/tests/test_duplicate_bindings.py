"""Scoped real-engine tests for AG18/AG19. No production DB connectivity implied."""
import unittest
from types import SimpleNamespace
from Agentic_AI.shared.execution.duplicate_bindings import make_duplicate_bindings
from Agentic_AI.shared.execution.duplicate_candidates import CandidateScopeError

class Repo:
    def __init__(self, records):
        self.records = records
        self.calls = []
    def list_candidates(self, **kwargs):
        self.calls.append(kwargs)
        return self.records

class DuplicateBindingsTest(unittest.TestCase):
    def setUp(self):
        self.pack = SimpleNamespace(tenant_id="orcimed", client_id="hetero")
    def test_icsr_pair_runs(self):
        repo = Repo([{"record_id":"OLD", "tenant_id":"orcimed","client_id":"hetero",
                     "record":{"case_id":"OLD","worldwide_unique_id":"WX-123"}}])
        fn = make_duplicate_bindings(repo)["AG19"]
        out = fn({"document_id":"NEW","case":{"case_id":"NEW","worldwide_unique_id":"WX-123"}}, self.pack)
        self.assertEqual(out["candidate_count"],1)
        self.assertTrue(out["requires_human_review"])
        self.assertEqual(repo.calls[0]["kind"],"icsr")
    def test_literature_pair_runs(self):
        repo = Repo([{"record_id":"OLD", "tenant_id":"orcimed","client_id":"hetero",
                     "record":{"record_id":"OLD","pmid":"123456"}}])
        out = make_duplicate_bindings(repo)["AG18"](
            {"document_id":"NEW","article":{"record_id":"NEW","pmid":"123456"}}, self.pack)
        self.assertEqual(out["candidate_count"],1)
        self.assertEqual(repo.calls[0]["kind"],"literature")
    def test_first_case_no_candidates(self):
        out = make_duplicate_bindings(Repo([]))["AG19"](
            {"document_id":"FIRST","case":{"case_id":"FIRST"}}, self.pack)
        self.assertEqual(out["comparisons"],[])
    def test_cross_tenant_fails_closed(self):
        repo=Repo([{"record_id":"OLD","tenant_id":"vigilare","client_id":"hetero",
                    "record":{"case_id":"OLD"}}])
        with self.assertRaises(CandidateScopeError):
            make_duplicate_bindings(repo)["AG19"](
                {"document_id":"NEW","case":{"case_id":"NEW"}}, self.pack)
    def test_malformed_candidate_fails_closed(self):
        repo=Repo([{"record_id":"OLD","tenant_id":"orcimed","client_id":"hetero",
                    "record":{"case_id":"DIFFERENT"}}])
        with self.assertRaises(CandidateScopeError):
            make_duplicate_bindings(repo)["AG19"](
                {"document_id":"NEW","case":{"case_id":"NEW"}}, self.pack)
if __name__ == "__main__":
    unittest.main()
