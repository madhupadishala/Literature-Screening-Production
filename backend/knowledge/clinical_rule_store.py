"""Versioned, tenant-scoped clinical decision rules. Standard-library SQLite foundation.

This is NOT a medical release engine: only explicitly approved rules can resolve.
Unapproved expert requirements remain in the Step 2.1 inventory.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

_IDENTIFIER = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_SCOPES = {"GLOBAL", "NEXUS", "TENANT", "CLIENT"}
_STATES = {"DRAFT", "APPROVED", "SUPERSEDED", "BLOCKED"}
_OPERATORS = {"eq", "neq", "in", "exists"}


class ClinicalRuleError(ValueError):
    pass


def _scope_id(value: str, name: str) -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        raise ClinicalRuleError(f"Invalid {name}")
    return value


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _validate_conditions(conditions: list[dict]) -> None:
    if not isinstance(conditions, list) or not conditions:
        raise ClinicalRuleError("Decision requires a nonempty conditions list")
    for clause in conditions:
        if not isinstance(clause, dict) or set(clause) - {"field", "op", "value"}:
            raise ClinicalRuleError("Unexpected condition fields")
        if not isinstance(clause.get("field"), str) or not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]*", clause["field"]):
            raise ClinicalRuleError("Only flat, declared fact names are allowed")
        if clause.get("op") not in _OPERATORS:
            raise ClinicalRuleError("Unsupported operator")
        if clause["op"] == "in" and (not isinstance(clause.get("value"), list) or not clause["value"]):
            raise ClinicalRuleError("in operator requires nonempty list")
        if clause["op"] != "exists" and "value" not in clause:
            raise ClinicalRuleError("Missing condition value")


def evaluate_decision_table(table: dict[str, Any], facts: dict[str, Any]) -> dict[str, Any]:
    """Deterministic first-match policy; never infer unknown facts as false."""
    if not isinstance(table, dict) or set(table) != {"clauses", "on_no_match"}:
        raise ClinicalRuleError("Decision table requires clauses and on_no_match")
    if not isinstance(facts, dict) or not isinstance(table["clauses"], list):
        raise ClinicalRuleError("Invalid decision input")
    for item in table["clauses"]:
        if not isinstance(item, dict) or set(item) != {"when", "decision"}:
            raise ClinicalRuleError("Malformed decision clause")
        _validate_conditions(item["when"])
        matches = []
        for c in item["when"]:
            key, op = c["field"], c["op"]
            if op == "exists":
                matches.append((key in facts) == bool(c.get("value", True)))
            elif key not in facts:
                matches.append(False)
            elif op == "eq":
                matches.append(facts[key] == c["value"])
            elif op == "neq":
                matches.append(facts[key] != c["value"])
            elif op == "in":
                matches.append(facts[key] in c["value"])
        if all(matches):
            return {"decision": item["decision"], "matched": True}
    return {"decision": table["on_no_match"], "matched": False}


@dataclass(frozen=True)
class RuleScope:
    tenant_id: str
    client_id: str
    jurisdiction: str
    agent: str
    as_of: str


class ClinicalRuleStore:
    """Append-only rule revisions and explicit publication, using transactional SQLite.

    Production DB deployment is deliberately not implied by this adapter.
    Only a trusted rule administrator should have write permissions.
    """

    def __init__(self, db_path: str | Path):
        self.path = str(db_path)
        if self.path == ":memory:":
            raise ClinicalRuleError("Use a file-backed database to preserve transactional state")
        self._initialize()

    def _connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        return db

    def _initialize(self):
        with self._connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS clinical_rule_revisions (
                rule_id TEXT NOT NULL, version INTEGER NOT NULL,
                owner_agent TEXT NOT NULL, domain TEXT NOT NULL,
                scope TEXT NOT NULL, tenant_id TEXT, client_id TEXT,
                jurisdiction TEXT NOT NULL, effective_from TEXT NOT NULL,
                effective_until TEXT, status TEXT NOT NULL,
                rule_text TEXT NOT NULL, reference_json TEXT NOT NULL,
                decision_json TEXT NOT NULL, checksum TEXT NOT NULL,
                PRIMARY KEY(rule_id, version),
                CHECK(scope IN ('GLOBAL','NEXUS','TENANT','CLIENT')),
                CHECK(status IN ('DRAFT','APPROVED','BLOCKED','SUPERSEDED'))
            )""")
            db.execute("CREATE INDEX IF NOT EXISTS idx_clinical_rules_scope ON clinical_rule_revisions(owner_agent, status, tenant_id, client_id, jurisdiction)")

    def add_revision(self, *, rule_id: str, version: int, owner_agent: str, domain: str,
                     scope: str, status: str, rule_text: str, decision_table: dict,
                     references: list[dict], effective_from: str, effective_until: str | None = None,
                     tenant_id: str | None = None, client_id: str | None = None,
                     jurisdiction: str = "GLOBAL") -> str:
        for name, value in (("rule_id", rule_id), ("owner_agent", owner_agent), ("domain", domain), ("jurisdiction", jurisdiction)):
            _scope_id(value, name)
        if scope not in _SCOPES or status not in _STATES or not isinstance(version, int) or version < 1:
            raise ClinicalRuleError("Invalid revision metadata")
        if scope in {"TENANT", "CLIENT"}:
            _scope_id(tenant_id, "tenant_id")
        if scope == "CLIENT":
            _scope_id(client_id, "client_id")
        if scope in {"GLOBAL", "NEXUS"} and (tenant_id or client_id):
            raise ClinicalRuleError("Global/Nexus policy cannot be bound to private scope")
        if scope == "TENANT" and client_id:
            raise ClinicalRuleError("Tenant policy cannot bind a client")
        try:
            start = date.fromisoformat(effective_from)
            end = date.fromisoformat(effective_until) if effective_until else None
        except (ValueError, TypeError) as exc:
            raise ClinicalRuleError("Invalid ISO policy date") from exc
        if end and end < start:
            raise ClinicalRuleError("End precedes start")
        if not rule_text.strip() or not isinstance(references, list):
            raise ClinicalRuleError("Rule text and references required")
        # Validate full table before persisting, even if no facts match.
        evaluate_decision_table(decision_table, {})
        identity = dict(rule_id=rule_id, version=version, owner_agent=owner_agent,
                        domain=domain, scope=scope, tenant_id=tenant_id, client_id=client_id,
                        jurisdiction=jurisdiction, effective_from=effective_from,
                        effective_until=effective_until, status=status, rule_text=rule_text,
                        references=references, decision_table=decision_table)
        digest = hashlib.sha256(_canonical(identity).encode()).hexdigest()
        with self._connect() as db:
            db.execute("""INSERT INTO clinical_rule_revisions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                       (rule_id, version, owner_agent, domain, scope, tenant_id, client_id,
                        jurisdiction, effective_from, effective_until, status, rule_text,
                        _canonical(references), _canonical(decision_table), digest))
        return digest

    def import_inventory_drafts(self, inventory: dict, *, effective_from: str = "2026-10-09") -> dict:
        """Stage inventory requirements without manufacturing executable clinical decisions.

        Each placeholder remains DRAFT and is therefore never resolved by decide().
        Repeated invocation is idempotent for the same inventory revision.
        """
        if inventory.get("schema_version") != "nexus.step2.clinical-traceability/1":
            raise ClinicalRuleError("Unsupported clinical inventory schema")
        inserted = skipped = 0
        placeholder = {"clauses": [{"when": [{"field": "never_activate_placeholder",
                                               "op": "eq", "value": True}],
                                    "decision": "MANUAL_REVIEW"}],
                       "on_no_match": "MANUAL_REVIEW"}
        for item in inventory.get("rules", []):
            rid = item["rule_id"]
            try:
                self.add_revision(rule_id=rid, version=1, owner_agent=item["owner"],
                    domain=item["domain"], scope="NEXUS", status="DRAFT",
                    rule_text=item["requirement"], decision_table=placeholder,
                    references=item.get("citations", []), effective_from=effective_from)
                inserted += 1
            except sqlite3.IntegrityError:
                with self._connect() as db:
                    row = db.execute("SELECT rule_text, status FROM clinical_rule_revisions WHERE rule_id=? AND version=1", (rid,)).fetchone()
                if not row or row["rule_text"] != item["requirement"] or row["status"] != "DRAFT":
                    raise ClinicalRuleError(f"Conflicting revision for {rid}")
                skipped += 1
        return {"inserted": inserted, "already_present": skipped, "activated": 0}

    def resolve(self, scope: RuleScope, rule_id: str) -> dict[str, Any] | None:
        _scope_id(rule_id, "rule_id")
        for name in ("tenant_id", "client_id", "jurisdiction", "agent"):
            _scope_id(getattr(scope, name), name)
        date.fromisoformat(scope.as_of)
        with self._connect() as db:
            rows = db.execute("""SELECT * FROM clinical_rule_revisions
             WHERE rule_id=? AND owner_agent=? AND status='APPROVED'
             AND effective_from<=? AND (effective_until IS NULL OR effective_until>=?)
             AND jurisdiction IN ('GLOBAL', ?)
             AND ((scope IN ('GLOBAL','NEXUS') AND tenant_id IS NULL AND client_id IS NULL)
              OR (scope='TENANT' AND tenant_id=? AND client_id IS NULL)
              OR (scope='CLIENT' AND tenant_id=? AND client_id=?))""",
                (rule_id, scope.agent, scope.as_of, scope.as_of, scope.jurisdiction,
                 scope.tenant_id, scope.tenant_id, scope.client_id)).fetchall()
        if not rows:
            return None
        rank = {"GLOBAL": 0, "NEXUS": 1, "TENANT": 2, "CLIENT": 3}
        rows = sorted(rows, key=lambda r: (rank[r["scope"]], r["jurisdiction"] == scope.jurisdiction,
                                         r["effective_from"], r["version"]), reverse=True)
        row = rows[0]
        if len(rows) > 1:
            a, b = rows[:2]
            if (rank[a["scope"]], a["jurisdiction"] == scope.jurisdiction, a["effective_from"], a["version"]) == (
                rank[b["scope"]], b["jurisdiction"] == scope.jurisdiction, b["effective_from"], b["version"]):
                raise ClinicalRuleError("Conflicting equally applicable rule revisions")
        return {"rule_id": row["rule_id"], "version": row["version"],
                "scope": row["scope"], "jurisdiction": row["jurisdiction"],
                "references": json.loads(row["reference_json"]),
                "rule_text": row["rule_text"],
                "decision_table": json.loads(row["decision_json"]),
                "checksum": row["checksum"], "status": row["status"]}

    def decide(self, scope: RuleScope, rule_id: str, facts: dict) -> dict:
        rule = self.resolve(scope, rule_id)
        if rule is None:
            return {"rule_id": rule_id, "state": "NO_APPROVED_RULE", "review_required": True}
        outcome = evaluate_decision_table(rule["decision_table"], facts)
        return {"rule_id": rule_id, "state": "EVALUATED", "version": rule["version"],
                "scope": rule["scope"], "checksum": rule["checksum"],
                "references": rule["references"], **outcome}
