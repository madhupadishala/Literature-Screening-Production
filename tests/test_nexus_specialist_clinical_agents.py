import unittest
from backend.knowledge.nexus_specialist_clinical_agents import (
 NexusDayZeroAgent,NexusDechallengeRechallengeAgent,NexusMedicalHistoryAgent)
class SpecialistEntrypoints(unittest.TestCase):
 def test_dechallenge_entrypoint(self):
  item={"product_id":"A","event_id":"rash","source_evidence":"report"}
  x=NexusDechallengeRechallengeAgent().run(
   tenant_id="t1",client_id="c1",case_id="case",validated_pairs=[item])
  self.assertEqual(x["pair_decisions"][0]["dechallenge"],"unknown")
  self.assertFalse(x["clinical_release_authorized"])
 def test_day_zero_entrypoint(self):
  row={"receipt_date":"2026-10-01","recipient_type":"MAH employee",
       "source_evidence":"dated initial valid notification",
       "qualifying_mah_receipt":True,"icsr_valid_at_receipt":True}
  x=NexusDayZeroAgent().run(tenant_id="t1",client_id="c1",case_id="case",validated_receipts=[row])
  self.assertEqual(x["day_zero_candidate"]["day_zero"],"2026-10-01")
 def test_medical_history_entrypoint(self):
  row={"patient_id":"p1","reported_condition":"tobacco use",
       "history_type":"tobacco","source_evidence":"source transcript"}
  x=NexusMedicalHistoryAgent().run(tenant_id="t1",client_id="c1",case_id="case",validated_history=[row])
  self.assertEqual(x["medical_history"][0]["category"],"social_history")
if __name__=="__main__":unittest.main()
