import json
from typing import Dict, Any
from backend.knowledge.knowledge_router import KnowledgeRouter
from backend.orchestrators.prompts import AgentPromptFactory, IntakeResponseSchema
from backend.orchestrators.llm_client import LiveLLMClient

class IntakeInputBuilder:
    def __init__(self, router: KnowledgeRouter):
        self.router = router
        self.client = LiveLLMClient()

    def construct_intake_json(self, tenant_id: str, evidence: Dict[str, Any], screening_res: Dict[str, Any]) -> str:
        context_pack = self.router.build_context_pack(tenant_id, "intake_input_builder", "map fields", evidence)
        downstream_payload = {
            "screening_decision": screening_res["llm_output"].get("screening_decision", "Invalid Case"),
            "screening_confidence": screening_res["llm_output"].get("confidence_score", 0.0)
        }
        
        system_prompt = AgentPromptFactory.build_intake_prompt(context_pack.to_dict(), downstream_payload)
        llm_output = self.client.call_agent_structured(system_prompt, evidence, IntakeResponseSchema)
        
        return json.dumps(llm_output, indent=2)