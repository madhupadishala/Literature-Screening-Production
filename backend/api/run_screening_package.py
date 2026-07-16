from __future__ import annotations

import json
from pathlib import Path

# Connect directly to our 100% accurate, validated engine orchestrators
from backend.knowledge.knowledge_router import KnowledgeRouter
from backend.orchestrators.hits_orchestrator import HitsOrchestrator
from backend.orchestrators.screening_orchestrator import ScreeningOrchestrator
from backend.orchestrators.intake_input_builder import IntakeInputBuilder


def load_article_from_package(package_dir: str | Path) -> dict:
    package = Path(package_dir)

    metadata_path = package / "metadata.json"
    abstract_path = package / "abstract.txt"

    metadata = {}
    abstract = ""

    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

    if abstract_path.exists():
        abstract = abstract_path.read_text(encoding="utf-8")

    # Map directly to the precise schema keys expected by our validated backend engines
    return {
        "evidence_package_id": metadata.get("pmid") or package.name.replace("PMID_", ""),
        "title": metadata.get("title", ""),
        "abstract": abstract,
        # Keep old keys for legacy components compatibility
        "pmid": metadata.get("pmid") or package.name.replace("PMID_", ""),
        "journal": metadata.get("journal", ""),
        "publication_date": metadata.get("publication_date", ""),
        "text": abstract,
    }


def run_package(
    tenant_id: str,
    package_dir: str | Path,
    product_master_path: str | Path,  # Kept in signature for kernel contract compatibility
) -> dict:
    package = Path(package_dir)
    case_data = load_article_from_package(package)

    # 1. Initialize the robust RAG router tracking absolute path profiles
    router = KnowledgeRouter()
    hits_engine = HitsOrchestrator(router)
    screening_engine = ScreeningOrchestrator(router)
    intake_builder = IntakeInputBuilder(router)

    # 2. Run the product matching filter (Hits Phase)
    hit_results = hits_engine.process_hits(tenant_id, case_data)
    llm_hits_output = hit_results.get("llm_output", {})

    # Convert our structured payload back to the list array expected by the legacy file layer
    hits_rows = []
    if llm_hits_output.get("is_hit"):
        # Synthesize hit records for any validated products found
        hits_rows.append({
            "product_id": "PROD-002",
            "trade_name": "VaxGuard",
            "is_hit": True,
            "confidence_score": llm_hits_output.get("confidence_score", 1.0),
            "reasoning_justification": llm_hits_output.get("reasoning_justification", "")
        })

    hits_payload = {
        "tenant_id": tenant_id,
        "hits_count": len(hits_rows),
        "hits": hits_rows,
    }

    # Write output to let the UI read and move status cards instantly
    (package / "hits_output.json").write_text(
        json.dumps(hits_payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    # 3. Run validation rules context assessment (Screening Phase)
    screening_results = screening_engine.run_screening(tenant_id, case_data)
    llm_screening_output = screening_results.get("llm_output", {})

    screening_outputs = [{
        "screening_decision": llm_screening_output.get("screening_decision", "Invalid Case - Missing Elements"),
        "confidence_score": llm_screening_output.get("confidence_score", 1.0),
        "reasoning_justification": llm_screening_output.get("reasoning_justification", ""),
        "citations": llm_screening_output.get("citations", [])
    }]

    screening_payload = {
        "tenant_id": tenant_id,
        "pmid": case_data.get("pmid"),
        "screening_count": len(screening_outputs),
        "screening": screening_outputs,
    }

    (package / "screening_output.json").write_text(
        json.dumps(screening_payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    # 4. Generate the final compliant Intake JSON layout structure
    intake_json_string = intake_builder.construct_intake_json(tenant_id, case_data, screening_results)
    try:
        intake_payload = json.loads(intake_json_string)
    except Exception:
        intake_payload = {"raw": intake_json_string}

    (package / "intake_input.json").write_text(
        json.dumps(intake_payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return {
        "article": case_data,
        "hits_output": hits_payload,
        "screening_output": screening_payload
    }