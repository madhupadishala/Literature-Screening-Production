import unittest
from Agentic_AI.shared.execution.duplicate_candidates import (
    AuthorizedDuplicateCandidateService, CandidateScopeError
)

class Repo:
    def __init__(self, rows):
        self.rows = rows
        self.last = None
    def list_candidates(self, **kwargs):
        self.last = kwargs
        return self.rows

class DuplicateScopeTests(unittest.TestCase):
    def test_same_client_only(self):
        repo=Repo([{"record_id":"OLD","tenant_id":"orcimed","client_id":"hetero"}])
        records=AuthorizedDuplicateCandidateService(repo).retrieve(
            kind="icsr",tenant_id="orcimed",client_id="hetero",exclude_id="NEW")
        self.assertEqual(len(records),1)
        self.assertEqual(repo.last["client_id"],"hetero")
    def test_other_tenant_same_client_rejected(self):
        repo=Repo([{"record_id":"OLD","tenant_id":"vigilare","client_id":"hetero"}])
        with self.assertRaises(CandidateScopeError):
            AuthorizedDuplicateCandidateService(repo).retrieve(
                kind="icsr",tenant_id="orcimed",client_id="hetero",exclude_id="NEW")
    def test_other_client_same_tenant_rejected(self):
        repo=Repo([{"record_id":"OLD","tenant_id":"orcimed","client_id":"cipla"}])
        with self.assertRaises(CandidateScopeError):
            AuthorizedDuplicateCandidateService(repo).retrieve(
                kind="literature",tenant_id="orcimed",client_id="hetero",exclude_id="NEW")
    def test_malformed_scope_rejected(self):
        with self.assertRaises(ValueError):
            AuthorizedDuplicateCandidateService(Repo([])).retrieve(
                kind="icsr",tenant_id="",client_id="hetero",exclude_id="NEW")
    def test_excludes_current_record(self):
        repo=Repo([{"record_id":"NEW","tenant_id":"orcimed","client_id":"hetero"}])
        self.assertEqual(AuthorizedDuplicateCandidateService(repo).retrieve(
            kind="icsr",tenant_id="orcimed",client_id="hetero",exclude_id="NEW"),[])

if __name__=="__main__":unittest.main()
