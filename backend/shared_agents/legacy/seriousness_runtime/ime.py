import json
import os
import re
from pathlib import Path

_DEFAULT = Path(__file__).parent / "data" / "ime_seed.json"


def _n(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


class ImeList:
    """Medically-important-event reference. The bundled seed is NOT the EMA IME list."""

    def __init__(self, path: str | None = None):
        p = Path(path or os.environ.get("SERIOUSNESS_IME_PATH", _DEFAULT))
        data = json.loads(p.read_text())
        self.version: str = data["version"]
        self._terms = {_n(t) for t in data["terms"]}

    def match(self, terms: list[str]) -> list[str]:
        return [t for t in terms if _n(t) in self._terms]
