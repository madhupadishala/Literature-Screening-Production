import hashlib
import json
import sqlite3
import threading
from datetime import datetime, timezone


class AuditLog:
    """Append-only, hash-chained audit store.

    The SQLite implementation is for local/CI use. Production should use an append-only database role or
    WORM sink. Narrative/PHI should not be placed in audit payloads; callers should persist hashes and
    governed evidence identifiers instead.
    """

    def __init__(self, path: str = ":memory:"):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        self.db.execute("CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, "
                        "ts TEXT, prev TEXT, hash TEXT, event_type TEXT, payload TEXT)")
        # Backward compatibility for older local DBs created before event_type existed.
        cols = {r[1] for r in self.db.execute("PRAGMA table_info(audit)")}
        if "event_type" not in cols:
            self.db.execute("ALTER TABLE audit ADD COLUMN event_type TEXT DEFAULT 'assessment'")
        self.db.commit()

    @staticmethod
    def _h(prev: str, ts: str, event_type: str, payload: str) -> str:
        return hashlib.sha256(f"{prev}|{ts}|{event_type}|{payload}".encode()).hexdigest()

    def append(self, payload: dict, *, event_type: str = "assessment") -> int:
        body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        ts = datetime.now(timezone.utc).isoformat()
        with self.lock:
            row = self.db.execute("SELECT hash FROM audit ORDER BY id DESC LIMIT 1").fetchone()
            prev = row[0] if row else "GENESIS"
            cur = self.db.execute("INSERT INTO audit(ts,prev,hash,event_type,payload) VALUES(?,?,?,?,?)",
                                  (ts, prev, self._h(prev, ts, event_type, body), event_type, body))
            self.db.commit()
            return cur.lastrowid

    def record_review(self, *, assessment_audit_id: int, reviewer_id: str,
                      action: str, reason: str, before: str | None = None,
                      after: str | None = None) -> int:
        return self.append({
            "assessment_audit_id": assessment_audit_id,
            "reviewer_id": reviewer_id,
            "action": action,
            "reason": reason,
            "before": before,
            "after": after,
        }, event_type="human_review")

    def verify(self) -> tuple[bool, int | None]:
        prev = "GENESIS"
        for id_, ts, p, h, event_type, body in self.db.execute(
                "SELECT id,ts,prev,hash,event_type,payload FROM audit ORDER BY id"):
            event_type = event_type or "assessment"
            if p != prev or self._h(p, ts, event_type, body) != h:
                return False, id_
            prev = h
        return True, None

    def export_manifest(self) -> dict:
        ok, bad_id = self.verify()
        rows = self.db.execute("SELECT COUNT(*), COALESCE(MAX(id),0), COALESCE(MAX(hash),'GENESIS') FROM audit").fetchone()
        return {
            "chain_valid": ok,
            "first_bad_id": bad_id,
            "record_count": rows[0],
            "last_id": rows[1],
            "last_hash": rows[2],
        }
