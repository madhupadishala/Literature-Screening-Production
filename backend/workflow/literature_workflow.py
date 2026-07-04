from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from backend.workflow import LiteratureWorkflow


def run_package(
    tenant_id: str,
    package_dir: str | Path,
    product_master_path: str | Path,
) -> Dict[str, Any]:
    workflow = LiteratureWorkflow(product_master_path)
    return workflow.run_package(
        tenant_id=tenant_id,
        package_dir=package_dir,
    )