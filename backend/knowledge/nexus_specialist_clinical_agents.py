"""Dedicated Nexus specialist clinical agent entrypoints (non-autonomous release)."""
from backend.knowledge.clinical_decision_adapters import NexusClinicalDecisionAdapter

class NexusDechallengeRechallengeAgent:
    AGENT_NAME = "dechallenge_rechallenge"
    def run(self, *, tenant_id, client_id, case_id, validated_pairs):
        result=NexusClinicalDecisionAdapter(self.AGENT_NAME).run(
            tenant_id=tenant_id,client_id=client_id,
            packet={"case_id":case_id,"dechallenge_rechallenge":validated_pairs})
        return {"schema_version":result["schema_version"],"case_id":case_id,
                "tenant_id":tenant_id,"client_id":client_id,
                "pair_decisions":result["dechallenge_rechallenge_decisions"],
                "requires_clinical_review":True,"clinical_release_authorized":False}

class NexusDayZeroAgent:
    AGENT_NAME = "day_zero"
    def run(self, *, tenant_id, client_id, case_id, validated_receipts):
        result=NexusClinicalDecisionAdapter(self.AGENT_NAME).run(
            tenant_id=tenant_id,client_id=client_id,
            packet={"case_id":case_id,"receipt_events":validated_receipts})
        return {"schema_version":result["schema_version"],"case_id":case_id,
                "tenant_id":tenant_id,"client_id":client_id,
                "receipts":result["receipt_events"],
                "day_zero_candidate":result["day_zero_candidate"],
                "requires_clinical_review":True,"clinical_release_authorized":False}

class NexusMedicalHistoryAgent:
    AGENT_NAME = "med_history"
    def run(self, *, tenant_id, client_id, case_id, validated_history):
        result=NexusClinicalDecisionAdapter(self.AGENT_NAME).run(
            tenant_id=tenant_id,client_id=client_id,
            packet={"case_id":case_id,"medical_history":validated_history})
        return {"schema_version":result["schema_version"],"case_id":case_id,
                "tenant_id":tenant_id,"client_id":client_id,
                "medical_history":result["medical_history"],
                "requires_clinical_review":True,"clinical_release_authorized":False}
