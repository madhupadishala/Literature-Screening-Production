import unittest
from types import SimpleNamespace
from Agentic_AI.shared.execution.v25_bindings import make_v25_bindings

class StubLLM:
    def complete_json(self, *, system, user, schema):
        # An explicit test double; it is not a clinical extraction provider.
        if "reporters" in schema.get("properties", {}):
            return {"reporters": []}
        return {"initials": None, "patient_id": None}

class V25Contracts(unittest.TestCase):
    def setUp(self):
        self.bindings = make_v25_bindings(StubLLM())
        self.pack = SimpleNamespace(tenant_id="orcimed", client_id="hetero")
    def test_opt_in_and_protocol(self):
        self.assertEqual(set(self.bindings), {"AG03","AG04","AG09","AG24"})
        with self.assertRaises(ValueError):
            make_v25_bindings(object())
    def test_input_validation(self):
        for agent in ("AG03","AG04","AG24"):
            with self.subTest(agent=agent), self.assertRaises(ValueError):
                self.bindings[agent]({"document_id":"DOC1","text":""}, self.pack)
        with self.assertRaises(ValueError):
            self.bindings["AG09"]({"document_id":"ONE","day_zero_input":{"case_id":"TWO"}}, self.pack)
    def test_recovered_patient_reporter_modules_import(self):
        from Agentic_AI.AG03_Patient_Identification.src.v2_5.patient.agent import PatientAgent
        from Agentic_AI.AG04_Reporter_Identification.src.v2_5.reporter.agent import ReporterAgent
        self.assertTrue(callable(PatientAgent))
        self.assertTrue(callable(ReporterAgent))

if __name__=="__main__":
    unittest.main()
