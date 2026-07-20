"""
screening.py
------------
ClinixAI Screening API Engine

Governs the processing boundaries of the Screening Engine utilizing:
    - Canonical Article Input Artifacts
    - Extracted Hits Output Matrices

Produces an atomically written and validated:
    - screening_output.json
"""

from __future__ import annotations

import json
import logging
import time
import tempfile
from pathlib import Path
from typing import Any, Dict

from backend.agents.screening import ScreeningOrchestrator

# Initialize structural log instrumentation for the screening framework
logger = logging.getLogger(__name__)


class ScreeningApi:
    """
    Enterprise-grade provider interface wrapping the ClinixAI deep AI screening workflows.
    Ensures safe resource handling, multi-tenant workspace protection, and performance observability.
    """

    def __init__(self) -> None:
        try:
            logger.debug("Initializing downstream processing dependencies...")
            self.orchestrator = ScreeningOrchestrator()
        except Exception as init_err:
            logger.critical(f"FATAL: Structural orchestration dependencies could not load: {str(init_err)}")
            raise

    def run(
        self,
        tenant_id: str,
        article_path: str | Path,
        hits_output_path: str | Path,
    ) -> Dict[str, Any]:
        """
        Executes literature parsing across defined dataset extraction footprints.
        
        Args:
            tenant_id: Targeted operational tenant scope allocation.
            article_path: Local file path to the incoming parsed text canonical article.
            hits_output_path: Local file path to the current parsed keywords hits registry.
            
        Returns:
            Dict[str, Any]: Normalized screening data dictionary payload for persistence checks.
        """
        # 1. Structural Parameter Validation Guards
        if not tenant_id or not isinstance(tenant_id, str):
            raise ValueError("Pipeline configuration error: 'tenant_id' must be an explicit, non-empty string.")

        start_time = time.perf_counter()
        article_path = Path(article_path)
        hits_output_path = Path(hits_output_path)

        logger.info(f"Opening pipeline process execution sequence for Tenant: [{tenant_id}]")

        # 2. Defensive Input File Ingestion & Parse Boundary Strategy
        try:
            if not article_path.exists():
                raise FileNotFoundError(f"Missing dependency payload: Canonical article file not found at '{article_path}'")
            if not hits_output_path.exists():
                raise FileNotFoundError(f"Missing dependency payload: Hits output manifest not found at '{hits_output_path}'")

            logger.debug(f"Streaming data artifacts from storage grids for tenant context '{tenant_id}'...")
            
            with article_path.open("r", encoding="utf-8") as f:
                article = json.load(f)

            with hits_output_path.open("r", encoding="utf-8") as f:
                hits_output = json.load(f)

        except json.JSONDecodeError as decode_error:
            logger.error(f"SCHEMA EXCEPTION: Failed to map file text content into structural objects: {str(decode_error)}")
            raise ValueError(f"Corrupt JSON artifact ingested down-pipeline: {str(decode_error)}") from decode_error
        except Exception as ingestion_error:
            logger.error(f"CRITICAL I/O FAILURE: System choked reading incoming data limits: {str(ingestion_error)}")
            raise

        # 3. Engine Execution Lifecycle & Microsecond Telemetry Tracking
        try:
            logger.info("Transferring data payload arrays down to AI ScreeningOrchestrator nodes...")
            engine_start = time.perf_counter()
            
            screening_output = self.orchestrator.run(
                tenant_id=tenant_id,
                article=article,
                hits_output=hits_output,
            )
            
            engine_duration = time.perf_counter() - engine_start
            logger.info(f"ScreeningOrchestrator processing successfully finalized in {engine_duration:.4f} seconds.")

        except Exception as agent_error:
            logger.error(f"AGENT RUNTIME EXCEPTION: Processing exception caught inside internal agent clusters: {str(agent_error)}")
            raise

        # 4. Atomic File Persistence Pattern (Guards against half-written data file corruption)
        output_path = hits_output_path.parent / "screening_output.json"
        logger.info(f"Preparing atomic disk write routine for output payload targeting location: '{output_path}'")
        
        tmp_filepath: Path | None = None
        try:
            parent_directory = output_path.parent
            parent_directory.mkdir(parents=True, exist_ok=True)

            # Write data string contents to a hidden temporary staging file within the same storage directory boundary
            with tempfile.NamedTemporaryFile(
                "w",
                dir=str(parent_directory),
                delete=False,
                suffix=".tmp",
                encoding="utf-8"
            ) as tmp_file:
                json.dump(screening_output, tmp_file, indent=2, ensure_ascii=False)
                tmp_filepath = Path(tmp_file.name)

            # Execute POSIX filesystem atomic rename swap to overwrite target file cleanly without gaps
            tmp_filepath.replace(output_path)
            logger.debug(f"Disk block verification completed successfully. Created isolated file artifact.")

        except Exception as write_error:
            logger.critical(f"PERSISTENCE FAILURE: Engine failed to write final state variables to disk matrix: {str(write_error)}")
            # Cleanup orphaned temp files if dangling after block error exceptions
            if tmp_filepath and tmp_filepath.exists():
                try:
                    tmp_filepath.unlink()
                except Exception:
                    pass
            raise

        total_transaction_duration = time.perf_counter() - start_time
        logger.info(
            f"Screening execution pipeline context finalized for Tenant [{tenant_id}] "
            f"in {total_transaction_duration:.4f}s total tracking time. Returning results."
        )

        return screening_output