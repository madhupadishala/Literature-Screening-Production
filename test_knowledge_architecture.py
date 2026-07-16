import os
import json
from backend.knowledge.vector_indexer import VectorIndexer
from backend.knowledge.knowledge_router import KnowledgeRouter
from backend.orchestrators.hits_orchestrator import HitsOrchestrator
from backend.orchestrators.screening_orchestrator import ScreeningOrchestrator
from backend.orchestrators.intake_input_builder import IntakeInputBuilder

def execute_verification_pipeline():
    print("=== [1/4] Initializing Vector Engine & Rules Loading ===")
    indexer = VectorIndexer()
    indexer.rebuild_index(tenant_id="demo-tenant")
    print("Vector storage successfully updated and persisted locally.")

    print("\n=== [2/4] Constructing Test Payload (PMID_DEMO001) ===")
    mock_evidence = {
        "evidence_package_id": "PMID_DEMO001",
        "title": "Clinical Evaluation of VaxGuard Antigen Alpha Exposure in Germany",
        "abstract": "A routine evaluation monitored adverse clinical presentations in Berlin. A patient showed immediate signs of exposure under specific conditions."
    }

    router = KnowledgeRouter()
    
    print("\n=== [3/4] Activating Engine Orchestration Layer ===")
    
    # 1. Process Hits
    hits_eng = HitsOrchestrator(router)
    hit_output = hits_eng.process_hits("demo-tenant", mock_evidence)
    print(f"Hits Engine Discovery: Is Hit? -> {hit_output['llm_output']['is_hit']}")
    print(f"Generated Hits Prompt Preview:\n{hit_output['llm_prompt'][:350]}...\n")
    
    # 2. Run Screening
    scr_eng = ScreeningOrchestrator(router)
    scr_output = scr_eng.run_screening("demo-tenant", mock_evidence)
    print(f"Screening Decision Engine Evaluation: {scr_output['llm_output']['screening_decision']}")
    print(f"Generated Screening Prompt Preview:\n{scr_output['llm_prompt'][:350]}...\n")

    # 3. Build Intake JSON
    intake_builder = IntakeInputBuilder(router)
    intake_json = intake_builder.construct_intake_json("demo-tenant", mock_evidence, scr_output)
    
    print("\n=== [4/4] Validating Final JSON Boundary Target ===")
    print(intake_json)

if __name__ == "__main__":
    execute_verification_pipeline()