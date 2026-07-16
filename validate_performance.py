import json
from backend.knowledge.vector_indexer import VectorIndexer
from backend.knowledge.knowledge_router import KnowledgeRouter
from backend.orchestrators.hits_orchestrator import HitsOrchestrator
from backend.orchestrators.screening_orchestrator import ScreeningOrchestrator
from backend.orchestrators.intake_input_builder import IntakeInputBuilder

MOCK_VALIDATION_SET = [
    {
        "evidence_package_id": "PMID_VAL_001",
        "title": "Accidental product overdose of VaxGuard in Munich clinic",
        "abstract": "A 45-year-old male patient experienced an accidental double-dose protocol overdose of VaxGuard antigen alpha in Germany. No long-term sequelae were noted.",
        "expected": {
            "is_hit": True,
            "screening_decision": "Valid via Tenant VaxGuard Special Override Rules", # Matches because Overdose is a Special Situation!
            "suspect_product": "VaxGuard"
        }
    },
    {
        "evidence_package_id": "PMID_VAL_002",
        "title": "Review of generic anti-infective treatment approaches",
        "abstract": "This review paper summarizes global trends across 2015-2025 regarding secondary exposures. No original individual patient data or case records were presented.",
        "expected": {
            "is_hit": False,
            "screening_decision": "Invalid Case - Missing Elements",
            "suspect_product": "Unknown Product"
        }
    },
    {
        "evidence_package_id": "PMID_VAL_003",
        "title": "Accidental overdose exposure of Clinixil in London",
        "abstract": "An anonymous reporter posted on a forum about an accidental exposure and overdose of clinician-prescribed Clinixil sodium paste in the United Kingdom. No clinical symptoms noted.",
        "expected": {
            "is_hit": False, # Clinixil is in UK (GB), which is outside our demo registered territories
            "screening_decision": "Invalid Case - Missing Elements",
            "suspect_product": "Unknown Product" 
        }
    }
]

def run_accuracy_benchmark():
    print("=== Warming Up Knowledge Registries & Vector DB Contexts ===")
    indexer = VectorIndexer()
    indexer.rebuild_index(tenant_id="demo-tenant")
    
    router = KnowledgeRouter()
    hits_eng = HitsOrchestrator(router)
    scr_eng = ScreeningOrchestrator(router)
    intake_builder = IntakeInputBuilder(router)
    
    passed_counts = 0
    total_cases = len(MOCK_VALIDATION_SET)
    
    print(f"\n=== Running RAG Grounded Performance Validation Matrix ({total_cases} PMIDs) ===")
    print(f"{'PMID':<13} | {'Metric':<20} | {'Expected Value':<45} | {'AI Output Value':<45} | {'Status'}")
    print("-" * 140)
    
    for case in MOCK_VALIDATION_SET:
        pmid = case["evidence_package_id"]
        expected = case["expected"]
        
        hit_res = hits_eng.process_hits("demo-tenant", case)
        scr_res = scr_eng.run_screening("demo-tenant", case)
        intake_res_json = intake_builder.construct_intake_json("demo-tenant", case, scr_res)
        
        intake_res = json.loads(intake_res_json)
        
        ai_hit = hit_res["llm_output"].get("is_hit", False)
        ai_decision = scr_res["llm_output"].get("screening_decision", "Invalid Case - Missing Elements")
        ai_product = intake_res.get("adverse_event_payload", {}).get("suspect_product", "Unknown Product")
        
        hit_match = bool(ai_hit) == bool(expected["is_hit"])
        decision_match = str(ai_decision).strip() == str(expected["screening_decision"]).strip()
        product_match = str(ai_product).strip() == str(expected["suspect_product"]).strip()
        
        if hit_match and decision_match and product_match:
            passed_counts += 1
            
        print(f"{pmid:<13} | {'Is Hit':<20} | {str(expected['is_hit']):<45} | {str(ai_hit):<45} | {'PASS' if hit_match else 'FAIL'}")
        print(f"{'':<13} | {'Screening Decision':<20} | {expected['screening_decision']:<45} | {ai_decision:<45} | {'PASS' if decision_match else 'FAIL'}")
        print(f"{'':<13} | {'Suspect Product':<20} | {expected['suspect_product']:<45} | {ai_product:<45} | {'PASS' if product_match else 'FAIL'}")
        print("-" * 140)

    accuracy_rate = (passed_counts / total_cases) * 100
    print(f"\nFinal Architecture Accuracy Score: {accuracy_rate:.2f}% ({passed_counts}/{total_cases} Cases Fully Aligned)")

if __name__ == "__main__":
    run_accuracy_benchmark()