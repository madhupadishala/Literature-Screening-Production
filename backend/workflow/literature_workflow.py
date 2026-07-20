"""
literature_workflow.py
----------------------
ClinixAI Deterministic Literature Processing Workflow Engine

Orchestrates the continuous data ingestion and verification lifecycle across:
    - Hits Extraction Matrix
    - Deep AI Screening Orchestration
    - Standardized Intake Payload Packaging

Ensures zero state corruption during high-throughput execution runs.
"""

from __future__ import annotations

import json
import logging
import time
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict

from backend.agents.hits.orchestrator import HitsOrchestrator
from backend.agents.screening import ScreeningOrchestrator
from backend.services.intake_input import IntakeInputBuilder
from backend.workflow.state_manager import PackageStatus, WorkflowStateManager

# Initialize structural engine logging diagnostics
logger = logging.getLogger(__name__)


class LiteratureWorkflow:
    """
    Enterprise Orchestration Worker driving the ingestion, verification, and transformation 
    of clinical text packages into formal pharmacovigilance and intake packages.
    """

    def __init__(self, product_master_path: str | Path) -> None:
        self.product_master_path = Path(product_master_path)
        
        if not self.product_master_path.exists():
            logger.warning(
                f"Configuration Boundary Alert: Product master dictionary artifact not "
                f"found at path '{self.product_master_path}'. Verify static configuration arrays."
            )

        logger.debug("Assembling underlying execution agents and state dependencies...")
        self.hits_orchestrator = HitsOrchestrator(self.product_master_path)
        self.screening_orchestrator = ScreeningOrchestrator()
        self.intake_input_builder = IntakeInputBuilder()
        self.state_manager = WorkflowStateManager()

    def run_package(
        self,
        tenant_id: str,
        package_dir: str | Path,
    ) -> Dict[str, Any]:
        """
        Executes the sequential end-to-end processing strategy for a localized evidence package folder.
        
        Enforces transaction tracking checkpoints to guarantee operational visibility.
        """
        package = Path(package_dir)
        workflow_start_time = time.perf_counter()

        logger.info(f"Starting deterministic lifecycle extraction loop for Package Workspace: [{package.name}] (Tenant: {tenant_id})")

        if not package.exists():
            raise FileNotFoundError(f"Operational package layout missing or unreachable: '{package}'")

        # ==========================================
        # PHASE 1: HITS EXTRACTION ENGINE
        # ==========================================
        try:
            self.state_manager.update(
                package,
                PackageStatus.HITS_RUNNING,
                "Hits workflow started",
            )

            # Ingest raw text nodes defensively
            article = self._load_article(package)

            logger.info(f"[{package.name}] Dispatching Hits Extraction Engine...")
            hits_phase_start = time.perf_counter()
            
            hits_rows = self.hits_orchestrator.run(
                tenant_id=tenant_id,
                article=article,
            )
            
            hits_duration = time.perf_counter() - hits_phase_start
            logger.info(f"[{package.name}] Hits processing succeeded. Found {len(hits_rows)} relevant key matches in {hits_duration:.4f}s.")

            hits_payload = {
                "tenant_id": tenant_id,
                "pmid": article.get("pmid"),
                "hits_count": len(hits_rows),
                "hits": hits_rows,
            }

            # Persist output cleanly via atomic disk boundaries
            self._write_json(package / "hits_output.json", hits_payload)

            self.state_manager.update(
                package,
                PackageStatus.HITS_COMPLETE,
                f"{len(hits_rows)} hit(s) generated",
            )
        except Exception as hits_exception:
            logger.error(f"CRITICAL Downstream Engine Failure during Hits Execution Phase on [{package.name}]: {str(hits_exception)}")
            raise

        # ==========================================
        # PHASE 2: DEEP AI SCREENING ENGINE
        # ==========================================
        try:
            self.state_manager.update(
                package,
                PackageStatus.SCREENING_RUNNING,
                "Screening workflow started",
            )

            logger.info(f"[{package.name}] Dispatching Deep AI Clinical Screening Nodes across extracted matrix...")
            screening_phase_start = time.perf_counter()

            screening_rows = [
                self.screening_orchestrator.run(
                    tenant_id=tenant_id,
                    article=article,
                    hits_output=hit,
                )
                for hit in hits_rows
            ]
            
            screening_duration = time.perf_counter() - screening_phase_start
            logger.info(f"[{package.name}] Automated AI Screening loops evaluated cleanly in {screening_duration:.4f}s.")

            screening_payload = {
                "tenant_id": tenant_id,
                "pmid": article.get("pmid"),
                "screening_count": len(screening_rows),
                "screening": screening_rows,
            }

            self._write_json(package / "screening_output.json", screening_payload)

            self.state_manager.update(
                package,
                PackageStatus.SCREENING_COMPLETE,
                f"{len(screening_rows)} screening record(s) generated",
            )
        except Exception as screening_exception:
            logger.error(f"CRITICAL Downstream Engine Failure during AI Screening Execution Phase on [{package.name}]: {str(screening_exception)}")
            raise

        # ==========================================
        # PHASE 3: COMPLIANCE INTAKE ARTIFACT CONSTRUCTION
        # ==========================================
        try:
            logger.info(f"[{package.name}] Initiating Intake Package Builder validation gates...")
            intake_phase_start = time.perf_counter()
            intake_inputs = []

            for index, screening_row in enumerate(screening_rows):
                # Apply explicit decision matching boundaries
                if screening_row.get("screening_decision") != "Proceed to Intake":
                    continue

                hit_row = hits_rows[index] if index < len(hits_rows) else {}

                intake_input = self.intake_input_builder.build(
                    tenant_id=tenant_id,
                    article=article,
                    screening_row=screening_row,
                    hit_row=hit_row,
                )

                intake_inputs.append(asdict(intake_input))

            intake_duration = time.perf_counter() - intake_phase_start
            logger.info(
                f"[{package.name}] Target Intake matrices generated. "
                f"Routed [{len(intake_inputs)}/{len(screening_rows)}] items to Intake queues in {intake_duration:.4f}s."
            )

            intake_input_payload = {
                "tenant_id": tenant_id,
                "pmid": article.get("pmid"),
                "intake_input_count": len(intake_inputs),
                "intake_inputs": intake_inputs,
            }

            self._write_json(package / "intake_input.json", intake_input_payload)

            self.state_manager.update(
                package,
                PackageStatus.INTAKE_INPUT_CREATED,
                f"{len(intake_inputs)} intake package(s) generated",
            )
        except Exception as intake_exception:
            logger.error(f"CRITICAL Downstream Engine Failure during Safety Intake Packaging Phase on [{package.name}]: {str(intake_exception)}")
            raise

        total_elapsed_duration = time.perf_counter() - workflow_start_time
        logger.info(f"SUCCESS: Package execution cycle for [{package.name}] fully completed in {total_elapsed_duration:.4f}s total runtime.")

        return {
            "article": article,
            "hits_output": hits_payload,
            "screening_output": screening_payload,
            "intake_input": intake_input_payload,
        }

    def _load_article(self, package: Path) -> Dict[str, Any]:
        """
        Defensively ingests local workspace file dependencies into memory objects.
        Ensures broken structures gracefully fallback rather than snapping the process loop.
        """
        metadata_path = package / "metadata.json"
        abstract_path = package / "abstract.txt"

        metadata = {}
        abstract = ""

        try:
            if metadata_path.exists():
                with metadata_path.open("r", encoding="utf-8") as f:
                    metadata = json.load(f)
        except (json.JSONDecodeError, IOError) as err:
            logger.error(f"Non-fatal parsing degradation: Could not load metadata structure in '{metadata_path}': {str(err)}")

        try:
            if abstract_path.exists():
                abstract = abstract_path.read_text(encoding="utf-8")
        except IOError as err:
            logger.error(f"Non-fatal reading degradation: Could not process file buffer content in '{abstract_path}': {str(err)}")

        return {
            "pmid": str(metadata.get("pmid") or package.name.replace("PMID_", "")),
            "title": str(metadata.get("title", "")),
            "journal": str(metadata.get("journal", "")),
            "publication_date": str(metadata.get("publication_date", "")),
            "abstract": abstract,
            "text": abstract,
        }

    @staticmethod
    def _write_json(path: Path, payload: Dict[str, Any]) -> None:
        """
        Enterprise-grade atomic file write routine. Prevents structural flatfile 
        truncation/corruption during intensive I/O operations or sudden network drops.
        """
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_filepath: Path | None = None
        
        try:
            # Stage changes to a hidden temporary validation file inside the target directory context
            with tempfile.NamedTemporaryFile(
                "w",
                dir=str(path.parent),
                delete=False,
                suffix=".tmp",
                encoding="utf-8"
            ) as tmp_file:
                json.dump(payload, tmp_file, indent=2, ensure_ascii=False)
                tmp_filepath = Path(tmp_file.name)

            # Perform atomic file descriptor swap
            tmp_filepath.replace(path)
            
        except Exception as write_error:
            logger.critical(f"PERSISTENCE PANIC: Atomic transaction swap failed mapping structural JSON to '{path}': {str(write_error)}")
            if tmp_filepath and tmp_filepath.exists():
                try:
                    tmp_filepath.unlink()
                except Exception:
                    pass
            raise