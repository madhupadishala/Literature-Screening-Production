import unittest
from backend.agents.drug_role.orchestrator import DrugRoleOrchestrator
from backend.agents.drug_role.schemas import DrugRole, Ownership

class DrugPolicyTests(unittest.TestCase):
    def test_company_matching_applies_to_suspect_only(self):
        narrative = ("Metformin was a concomitant medication. "
                     "Amoxicillin was suspected of causing a rash. "
                     "Cetirizine was given for treatment of the rash.")
        result = DrugRoleOrchestrator().classify(
            case_id="case01",tenant_id="tenant01",source_type="spontaneous",
            text=narrative,candidate_drugs=["Metformin","Amoxicillin","Cetirizine"],
            company_products=[
                {"trade_name":"Metformin","active_ingredients":["metformin"]},
                {"trade_name":"Amoxicillin","active_ingredients":["amoxicillin"]},
                {"trade_name":"Cetirizine","active_ingredients":["cetirizine"]},
            ])
        indexed = {x.normalized_name.casefold(): x for x in result.classifications}
        self.assertEqual(indexed["amoxicillin"].role, DrugRole.SUSPECT)
        self.assertEqual(indexed["amoxicillin"].ownership, Ownership.COMPANY)
        self.assertEqual(indexed["metformin"].ownership, Ownership.UNKNOWN)
        self.assertEqual(indexed["cetirizine"].ownership, Ownership.UNKNOWN)
        self.assertIsNone(indexed["metformin"].product_master_match)
        self.assertIsNone(indexed["cetirizine"].product_master_match)


    def test_nexus_agent_exposes_validated_regimens(self):
        from backend.agents.drug_role.nexus_agent import NexusDrugRoleAgent
        from backend.knowledge.agent_context_pack import AgentContextPack
        class Router:
            def build_context_pack(self, **kw):
                return AgentContextPack(tenant_id=kw["tenant_id"], agent=kw["agent_name"], evidence_package_id="case02")
        packet = {
            "case_id":"case02",
            "text":"Metformin was a historical medication.",
            "validated_drug_exposures":[
                {"reported_name":"Metformin","strength":"500 mg","formulation":"tablet",
                 "role":"HISTORICAL","start_date":"2022-01","end_date":"2022-12","source_evidence":"span A"},
                {"reported_name":"Metformin","strength":"500 mg","formulation":"tablet",
                 "role":"HISTORICAL","start_date":"2023-02","end_date":"2023-08","source_evidence":"span B"}
            ]
        }
        result = NexusDrugRoleAgent(knowledge_router=Router()).run(
            tenant_id="tenant01",client_id="client01",evidence_package=packet,
            candidate_drugs=["Metformin"])
        self.assertEqual(len(result["exposure_products"]),1)
        self.assertEqual(len(result["exposure_products"][0]["regimens"]),2)
        self.assertIn("DR-011",result["exposure_policy_rules"])


    def test_ae_treatment_role_retained_despite_later_attribution(self):
        text=("Cetirizine was given for treatment of the rash. "
              "Later dizziness was attributed to Cetirizine.")
        result=DrugRoleOrchestrator().classify(
            case_id="case03", tenant_id="tenant01",source_type="spontaneous",
            text=text,candidate_drugs=["Cetirizine"])
        item=result.classifications[0]
        self.assertEqual(item.role, DrugRole.TREATMENT)
        self.assertIn("treatment",item.rationale.lower())

if __name__ == "__main__":
    unittest.main()
