"""PostgreSQL adapter for approved clinical policy reads.

Use a non-owner, NOBYPASSRLS credential. Never connect using Neon owner.
"""
from __future__ import annotations
import json
from dataclasses import dataclass
from typing import Any
from backend.knowledge.clinical_rule_store import (
    ClinicalRuleError, RuleScope, evaluate_decision_table, _scope_id,
)

class PostgresClinicalRuleStore:
    def __init__(self, connect):
        """Inject a zero-argument psycopg connection factory, not a DSN in logs."""
        if not callable(connect):
            raise TypeError("Database connector must be callable")
        self._connect = connect

    def resolve(self, scope: RuleScope, rule_id: str) -> dict[str, Any] | None:
        _scope_id(rule_id, "rule_id")
        for field in ("tenant_id", "client_id", "jurisdiction", "agent"):
            _scope_id(getattr(scope, field), field)
        from datetime import date
        date.fromisoformat(scope.as_of)
        sql = """SELECT rule_id,version,policy_scope,jurisdiction,
                      regulatory_references,rule_text,decision_table,checksum
                 FROM public.nexus_clinical_rule_revisions
                 WHERE rule_id=%s AND owner_agent=%s
                   AND approval_status='APPROVED'
                   AND effective_from<=%s::date
                   AND (effective_until IS NULL OR effective_until>=%s::date)
                   AND jurisdiction IN ('GLOBAL',%s)
                   AND (policy_scope IN ('GLOBAL','NEXUS')
                       OR (policy_scope='TENANT' AND tenant_id=%s)
                       OR (policy_scope='CLIENT' AND tenant_id=%s AND client_id=%s))
                 ORDER BY CASE policy_scope WHEN 'CLIENT' THEN 4
                           WHEN 'TENANT' THEN 3 WHEN 'NEXUS' THEN 2 ELSE 1 END DESC,
                          (jurisdiction=%s) DESC, effective_from DESC, version DESC
                 LIMIT 2"""
        with self._connect() as db:
            # Owner credentials defeat RLS even when FORCE is set if role BYPASSRLS.
            with db.cursor() as c:
                c.execute("SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user")
                if c.fetchone()[0]:
                    raise ClinicalRuleError("RLS bypass credential forbidden for clinical rule reads")
                c.execute(sql,(rule_id,scope.agent,scope.as_of,scope.as_of,scope.jurisdiction,
                               scope.tenant_id,scope.tenant_id,scope.client_id,scope.jurisdiction))
                rows=c.fetchall()
        if not rows:
            return None
        row=rows[0]
        return {"rule_id":row[0],"version":row[1],"scope":row[2],
                "jurisdiction":row[3],"references":row[4],
                "rule_text":row[5],"decision_table":row[6],"checksum":row[7],
                "status":"APPROVED"}

    def decide(self, scope: RuleScope, rule_id: str, facts: dict) -> dict:
        rule=self.resolve(scope,rule_id)
        if rule is None:
            return {"rule_id":rule_id,"state":"NO_APPROVED_RULE","review_required":True}
        outcome=evaluate_decision_table(rule["decision_table"],facts)
        return {"rule_id":rule_id,"state":"EVALUATED","version":rule["version"],
                "scope":rule["scope"],"checksum":rule["checksum"],
                "references":rule["references"], **outcome}
