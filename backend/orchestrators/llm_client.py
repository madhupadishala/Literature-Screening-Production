import os
import json
from typing import Dict, Any, Type
from groq import Groq
from pydantic import BaseModel

class LiveLLMClient:
    def __init__(self):
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("CRITICAL: GROQ_API_KEY environment variable is missing.")
        
        self.client = Groq(api_key=api_key)
        # Updated to Groq's active high-speed production engine
        self.model_name = "openai/gpt-oss-120b"

    def call_agent_structured(self, system_prompt: str, user_payload: Dict[str, Any], schema_contract: Type[BaseModel]) -> Dict[str, Any]:
        schema_instructions = f"\n\nYou MUST respond with a valid JSON object matching this exact structural schema: {json.dumps(schema_contract.model_json_schema())}"
        
        try:
            chat_completion = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {
                        "role": "system",
                        "content": f"{system_prompt}{schema_instructions}"
                    },
                    {
                        "role": "user",
                        "content": f"INPUT DATA:\n{json.dumps(user_payload)}"
                    }
                ],
                response_format={"type": "json_object"},
                temperature=0.0
            )
            
            return json.loads(chat_completion.choices[0].message.content)
            
        except Exception as e:
            print(f"[GROQ SDK ERROR TRACE] Call failed: {str(e)}")
            return {
                "is_hit": False,
                "screening_decision": "Invalid Case - Missing Elements",
                "adverse_event_payload": {
                    "is_valid_run": False,
                    "suspect_product": "Unknown Product",
                    "extracted_countries": []
                },
                "audit_trail": {
                    "confidence_score": 0.0,
                    "reasoning_justification": f"Groq execution failure fallback: {str(e)}",
                    "applied_citations": []
                }
            }