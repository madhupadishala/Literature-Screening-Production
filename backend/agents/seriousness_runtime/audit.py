import hashlib
import json
import sqlite3
import threading
from datetime import datetime, timezone


class AuditLog:
    """Append-only, hash-chained. Tamper-evident, not tamper-proof: in production put it on
    Postgres with UPDATE/DELETE revoked, or ship rows to WORM storage."""

    def __init__(self, path: str = ":memory:"):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        self.db.execute("CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, "
                        "ts TEXT, prev TEXT, hash TEXT, payload TEXT)")
        self.db.commit()

    @staticmethod
    def _h(prev: str, ts: str, payload: str) -> str:
        return hashlib.sha256(f"{prev}|{ts}|{payload}".encode()).hexdigest()

    def append(self, payload: dict) -> int:
        body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        ts = datetime.now(timezone.utc).isoformat()
        with self.lock, self.db:
            self.db.execute("BEGIN IMMEDIATE")
            row = self.db.execute("SELECT hash FROM audit ORDER BY id DESC LIMIT 1").fetchone()
            prev = row[0] if row else "GENESIS"
            cur = self.db.execute("INSERT INTO audit(ts,prev,hash,payload) VALUES(?,?,?,?)",
                                  (ts, prev, self._h(prev, ts, body), body))
            return cur.lastrowid

    def verify(self) -> tuple[bool, int | None]:
        prev = "GENESIS"
        for id_, ts, p, h, body in self.db.execute("SELECT id,ts,prev,hash,payload FROM audit ORDER BY id"):
            if p != prev or self._h(p, ts, body) != h:
                return False, id_
            prev = h
        return True, None
