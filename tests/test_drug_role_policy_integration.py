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

if __name__ == "__main__":
    unittest.main()
