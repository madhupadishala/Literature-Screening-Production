"""Step 2.3: DR-012 validated vaccine-dose separation regression."""
import unittest
from backend.agents.drug_role.exposure_policy import normalize_product_exposures


class HistoricalVaccineDoseTests(unittest.TestCase):
    def test_historical_dose_not_inferred_suspect_from_later_dose(self):
        exposures = [
            {
                "reported_name": "Vaccine X", "strength": "0.5 mL",
                "formulation": "suspension", "role": "HISTORICAL",
                "vaccine_dose_id": "dose-1", "vaccine_dose_role": "HISTORICAL",
                "start_date": "2023-01-10", "source_evidence": "previous dose on Jan 10",
            },
            {
                "reported_name": "Vaccine X", "strength": "0.5 mL",
                "formulation": "suspension", "role": "SUSPECT",
                "vaccine_dose_id": "dose-2", "vaccine_dose_role": "SUSPECT",
                "start_date": "2023-02-10", "source_evidence": "reaction after second dose",
            },
        ]
        products = normalize_product_exposures(exposures)
        self.assertEqual(len(products), 1)
        regimens = products[0]["regimens"]
        self.assertEqual(len(regimens), 2)
        self.assertEqual([r["vaccine_dose_id"] for r in regimens], ["dose-1", "dose-2"])
        self.assertEqual([r["vaccine_dose_role"] for r in regimens], ["HISTORICAL", "SUSPECT"])

    def test_unspecified_dose_role_not_invented(self):
        item = {
            "reported_name": "Vaccine X", "source_evidence": "prior vaccination",
            "role": "HISTORICAL",
        }
        regimen = normalize_product_exposures([item])[0]["regimens"][0]
        self.assertIsNone(regimen["vaccine_dose_id"])
        self.assertIsNone(regimen["vaccine_dose_role"])


if __name__ == "__main__":
    unittest.main()
