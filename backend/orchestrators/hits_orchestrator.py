from typing import Dict, Any
from backend.knowledge.knowledge_router import KnowledgeRouter
from backend.orchestrators.prompts import AgentPromptFactory, HitsResponseSchema
from backend.orchestrators.llm_client import LiveLLMClient

class HitsOrchestrator:
    def __init__(self, router: KnowledgeRouter):
        self.router = router
        self.client = LiveLLMClient()

    def process_hits(self, tenant_id: str, evidence: Dict[str, Any]) -> Dict[str, Any]:
        context_pack = self.router.build_context_pack(tenant_id, "hits_agent", "verify hits", evidence)
        system_prompt = AgentPromptFactory.build_hits_prompt(context_pack.to_dict())
        llm_output = self.client.call_agent_structured(system_prompt, evidence, HitsResponseSchema)
        
        return {"llm_prompt": system_prompt, "llm_output": llm_output, "context_applied": context_pack.to_dict()}