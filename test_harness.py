import os
import json
import uvicorn
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Dict, Any, List

# Boot your platform's foundational kernel to safely resolve core dependencies
try:
    from app import boot
    boot()
    print("[NEXUS KERNEL] Foundational microkernel booted successfully.")
except Exception as e:
    print(f"[NEXUS KERNEL WARNING] Non-blocking boot notice: {str(e)}")

# Import your validated multi-agent pipeline components
from backend.knowledge.knowledge_router import KnowledgeRouter
from backend.orchestrators.hits_orchestrator import HitsOrchestrator
from backend.orchestrators.screening_orchestrator import ScreeningOrchestrator
from backend.orchestrators.intake_input_builder import IntakeInputBuilder

# Initialize the standalone FastAPI test application instance
app = FastAPI(
    title="Pharmacovigilance Literature Screening - QC & Test Playground",
    description=(
        "A dedicated testing harness for Quality Control (QC) analysts to evaluate real-time "
        "adverse event detection, client rule overrides, and RAG tracking data payloads."
    ),
    version="1.0.0"
)

# Instantiate the core architecture singletons
router = KnowledgeRouter()
hits_engine = HitsOrchestrator(router)
screening_engine = ScreeningOrchestrator(router)
intake_builder = IntakeInputBuilder(router)

# Pure structured inputs for the testing playground
class LiteraturePackageInput(BaseModel):
    evidence_package_id: str = Field(..., description="Unique publication tracker identifier", example="PMID_QC_001")
    title: str = Field(..., description="The article or literature title string", example="Accidental overdose of VaxGuard reported")
    abstract: str = Field(..., description="The clinical study summary text containing context details", example="A patient in Munich experienced an accidental overdose of VaxGuard antigen alpha in Germany.")

@app.post("/api/v1/qc/screen", tags=["QC Evaluation Pipeline"])
async def process_literature_screening(
    payload: LiteraturePackageInput,
    tenant_id: str = Header(..., description="The workspace tenant token partition identifier", example="demo-tenant")
):
    """
    Executes the full validated RAG architecture cascade over Groq hardware infrastructure.
    QCers can alter product names, actions, and locations to test compliance validation boundaries.
    """
    try:
        # Convert incoming payload to execution dictionary
        case_data = payload.model_dump()
        
        # 1. Step 1: Run Product/Country Matching Validation Filter
        hit_results = hits_engine.process_hits(tenant_id, case_data)
        
        # 2. Step 2: Extract Chroma Vector Space Rules & Tenant Special Overrides
        screening_results = screening_engine.run_screening(tenant_id, case_data)
        
        # 3. Step 3: Build Downstream Regulatory Structural Record Layouts
        intake_json_string = intake_builder.construct_intake_json(tenant_id, case_data, screening_results)
        
        # Parse output data back into a rich JSON structure for the tester
        return {
            "status": "success",
            "evaluation_metrics": {
                "is_hit": hit_results["llm_output"].get("is_hit", False),
                "hits_confidence": hit_results["llm_output"].get("confidence_score", 0.0),
                "screening_decision": screening_results["llm_output"].get("screening_decision", "Invalid Case - Missing Elements"),
                "screening_confidence": screening_results["llm_output"].get("confidence_score", 0.0)
            },
            "audit_trail": {
                "hits_reasoning": hit_results["llm_output"].get("reasoning_justification", ""),
                "screening_reasoning": screening_results["llm_output"].get("reasoning_justification", ""),
                "applied_citations": screening_results["llm_output"].get("citations", [])
            },
            "downstream_intake_payload": json.loads(intake_json_string)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"QC Test Harness Processing Exception: {str(e)}")

@app.get("/api/v1/qc/health", tags=["System Status"])
async def health_check():
    return {
        "status": "online",
        "active_engine": "Groq Llama-3-OSS Gateway",
        "rag_context_sync": "ChromaDB Connected"
    }

if __name__ == "__main__":
    # Launch on port 8080 to avoid overlapping standard 8000 microservice channels
    uvicorn.run("test_harness:app", host="127.0.0.1", port=8080, reload=True)