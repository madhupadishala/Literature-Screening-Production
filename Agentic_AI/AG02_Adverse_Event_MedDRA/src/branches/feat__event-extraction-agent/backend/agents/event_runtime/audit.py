import json
import os
import sqlite3
from datetime import datetime, timezone
from hashlib import sha256

class AuditStore:
    """Local durable audit. Deploy on encrypted persistent storage, one service instance.
    Hashes detect record alteration; external anchoring is required against DB-owner rewrites.
    """
    def __init__(self, path):
        self.path = path
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS runs (tenant TEXT, key TEXT, request_hash TEXT, payload TEXT, PRIMARY KEY(tenant,key))")
            db.execute("CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, tenant TEXT, at TEXT, run_id TEXT, previous TEXT, digest TEXT)")
            db.execute("""CREATE TABLE IF NOT EXISTS coding_validation_audit (
                tenant TEXT NOT NULL, client TEXT NOT NULL, case_digest TEXT NOT NULL,
                run_id TEXT NOT NULL, event_type TEXT NOT NULL, decision_digest TEXT NOT NULL,
                dictionary_version TEXT, recorded_at TEXT NOT NULL,
                PRIMARY KEY(tenant, client, run_id, event_type))""")
        os.chmod(path, 0o600)

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def get(self, tenant, key):
        with self.connect() as db:
            return db.execute("SELECT request_hash,payload FROM runs WHERE tenant=? AND key=?", (tenant,key)).fetchone()

    def save(self, tenant, key, request_hash, result):
        payload = result.model_dump_json()
        at = datetime.now(timezone.utc).isoformat()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT digest FROM audit WHERE tenant=? ORDER BY id DESC LIMIT 1", (tenant,)).fetchone()
            previous = previous[0] if previous else "0" * 64
            digest = sha256(json.dumps([tenant, at, result.run_id, previous, payload], ensure_ascii=False).encode()).hexdigest()
            db.execute("INSERT INTO runs VALUES (?,?,?,?)", (tenant,key,request_hash,payload))
            db.execute("INSERT INTO audit(tenant,at,run_id,previous,digest) VALUES (?,?,?,?,?)", (tenant,at,result.run_id,previous,digest))

    def verify(self, tenant):
        with self.connect() as db:
            rows = db.execute("SELECT at,run_id,previous,digest FROM audit WHERE tenant=? ORDER BY id", (tenant,)).fetchall()
            payload_rows = db.execute("SELECT payload FROM runs WHERE tenant=?", (tenant,)).fetchall()
            try:
                payload_ids = [json.loads(p)["run_id"] for (p,) in payload_rows]
            except (ValueError, KeyError, TypeError):
                return False
            audit_ids = [row[1] for row in rows]
            if (any(not isinstance(run_id, str) or not run_id for run_id in payload_ids)
                    or len(set(payload_ids)) != len(payload_ids)
                    or len(set(audit_ids)) != len(audit_ids)
                    or set(payload_ids) != set(audit_ids)):
                return False
            payloads = dict(zip(payload_ids, (p for (p,) in payload_rows)))
            previous = "0" * 64
            for at, run_id, recorded_previous, digest in rows:
                if run_id not in payloads or recorded_previous != previous:
                    return False
                expected = sha256(json.dumps([tenant, at, run_id, previous, payloads[run_id]], ensure_ascii=False).encode()).hexdigest()
                if expected != digest:
                    return False
                previous = digest
            return True

    def record_coding_validation(self, *, tenant, client, case_digest, run_id,
                                 event_type, decision_digest, dictionary_version=None):
        """Append scoped metadata only; never persist patient text or raw prompts."""
        import re
        for value in (tenant, client, run_id, event_type):
            if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", value):
                raise ValueError("invalid audit scope")
        for digest in (case_digest, decision_digest):
            if not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
                raise ValueError("invalid SHA256 audit digest")
        if dictionary_version is not None and (not isinstance(dictionary_version, str) or
                                                len(dictionary_version) > 64):
            raise ValueError("invalid dictionary version")
        from Agentic_AI.shared.validation import safe_audit_metadata
        safe_audit_metadata(tenant=tenant, client=client, case_digest=case_digest,
                            decision_digest=decision_digest, event_type=event_type)
        with self.connect() as db:
            db.execute("INSERT INTO coding_validation_audit VALUES (?,?,?,?,?,?,?,?)",
                       (tenant, client, case_digest, run_id, event_type, decision_digest,
                        dictionary_version, datetime.now(timezone.utc).isoformat()))
