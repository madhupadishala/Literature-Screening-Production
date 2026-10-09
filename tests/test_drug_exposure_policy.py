import unittest
from backend.agents.drug_role.exposure_policy import normalize_product_exposures
class ExposurePolicyTests(unittest.TestCase):
    def test_repeat_historical_exposures_remain_separate_regimens(self):
        e=[{"reported_name":"Metformin","strength":"500 mg","formulation":"tablet",
            "role":"HISTORICAL","start_date":start,"end_date":stop,"source_evidence":str(i)}
           for i,(start,stop) in enumerate([("2022-01","2022-12"),("2023-02","2023-08"),("2024-01","2026-03")],1)]
        p=normalize_product_exposures(e)
        self.assertEqual(len(p),1)
        self.assertEqual(len(p[0]["regimens"]),3)
        self.assertEqual(p[0]["regimens"][1]["start_date"],"2023-02")
    def test_explicit_strength_or_form_creates_separate_product(self):
        base=dict(reported_name="Paracetamol",source_evidence="reported",role="SUSPECT")
        p=normalize_product_exposures([
            dict(base,strength="500 mg",formulation="tablet"),
            dict(base,strength="600 mg",formulation="tablet"),
            dict(base,strength="500 mg",formulation="injection")])
        self.assertEqual(len(p),3)
    def test_route_change_does_not_infer_formulation(self):
        base=dict(reported_name="Paracetamol",source_evidence="reported",strength="500 mg")
        p=normalize_product_exposures([dict(base,route="oral"),dict(base,route="IV")])
        self.assertEqual(len(p),1)
        self.assertIsNone(p[0]["formulation"])
        self.assertTrue(p[0]["review_required"])
    def test_generic_only_fills_both_fields(self):
        p=normalize_product_exposures([dict(reported_name="acetaminophen",source_evidence="source",strength="500 mg",formulation="tablet")])
        self.assertEqual(p[0]["brand_name"],"acetaminophen")
        self.assertEqual(p[0]["generic_name"],"acetaminophen")
    def test_absent_source_evidence_fails(self):
        with self.assertRaises(ValueError):
            normalize_product_exposures([{"reported_name":"Metformin"}])
if __name__=="__main__":unittest.main()
