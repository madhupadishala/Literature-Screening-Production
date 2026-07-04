from __future__ import annotations

import json
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List


class PackageStatus(str, Enum):
    NEW = "NEW"
    HITS_RUNNING = "HITS_RUNNING"
    HITS_COMPLETE = "HITS_COMPLETE"
    READY_FOR_SCREENING = "READY_FOR_SCREENING"
    SCREENING_RUNNING = "SCREENING_RUNNING"
    SCREENING_COMPLETE = "SCREENING_COMPLETE"
    INTAKE_INPUT_CREATED = "INTAKE_INPUT_CREATED"
    FAILED = "FAILED"


class WorkflowStateManager:
    FILE_NAME = "workflow_state.json"

    def read(self, package_dir: str | Path) -> Dict[str, Any]:
        package = Path(package_dir)
        state_path = package / self.FILE_NAME

        if not state_path.exists():
            return {
                "status": PackageStatus.NEW.value,
                "history": [],
            }

        return json.loads(state_path.read_text(encoding="utf-8"))

    def update(
        self,
        package_dir: str | Path,
        status: PackageStatus,
        reason: str,
        actor: str = "system",
        metadata: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        package = Path(package_dir)
        package.mkdir(parents=True, exist_ok=True)

        current = self.read(package)
        history: List[Dict[str, Any]] = current.get("history", [])

        event = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "from_status": current.get("status", PackageStatus.NEW.value),
            "to_status": status.value,
            "reason": reason,
            "actor": actor,
            "metadata": metadata or {},
        }

        state = {
            "status": status.value,
            "updated_at": event["timestamp"],
            "history": history + [event],
        }

        (package / self.FILE_NAME).write_text(
            json.dumps(state, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        return state