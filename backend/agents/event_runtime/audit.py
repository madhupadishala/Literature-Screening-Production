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
            payloads = {json.loads(p)["run_id"]: p for (p,) in db.execute("SELECT payload FROM runs WHERE tenant=?", (tenant,))}
            previous = "0" * 64
            for at, run_id, recorded_previous, digest in rows:
                if run_id not in payloads or recorded_previous != previous:
                    return False
                expected = sha256(json.dumps([tenant, at, run_id, previous, payloads[run_id]], ensure_ascii=False).encode()).hexdigest()
                if expected != digest:
                    return False
                previous = digest
            return True
