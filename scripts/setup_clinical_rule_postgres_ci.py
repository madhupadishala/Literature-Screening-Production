"""Prepare ephemeral PostgreSQL CI fixtures for Nexus clinical rule-store tests.

Only use against the PostgreSQL service container created by the CI workflow.
"""
import json
import os
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

dsn = os.environ["NEXUS_CLINICAL_RULE_ADMIN_DSN"]
inventory = json.loads((Path(__file__).resolve().parents[1] / "docs/agents/step-02/clinical_rule_traceability.json").read_text())
assert len(inventory["rules"]) == 35
placeholder = {
    "clauses": [{"when": [{"field": "never_activate_placeholder", "op": "eq", "value": True}],
                 "decision": "MANUAL_REVIEW"}],
    "on_no_match": "MANUAL_REVIEW",
}
synthetic = {
    "clauses": [{"when": [{"field": "explicit_ae", "op": "eq", "value": True}], "decision": "EXTRACT"}],
    "on_no_match": "REVIEW",
}
with psycopg.connect(dsn) as db:
    with db.cursor() as cur:
        cur.execute("CREATE ROLE nexus_ci_reader LOGIN PASSWORD 'ci_reader_password' IN ROLE nexus_clinical_rule_reader")
        cur.execute("CREATE ROLE nexus_ci_approver LOGIN PASSWORD 'ci_approver_password' IN ROLE nexus_clinical_rule_approver")
        cur.execute("""INSERT INTO public.nexus_clinical_rule_principals
                    (role_name,tenant_id,client_id,allowed_agent,enabled)
                    VALUES ('nexus_ci_reader','tenant_A','client_A','adverse_event_extraction',true)""")
        query = """INSERT INTO public.nexus_clinical_rule_revisions
                  (rule_id,version,owner_agent,domain,policy_scope,tenant_id,client_id,
                   jurisdiction,effective_from,approval_status,rule_text,
                   regulatory_references,decision_table,checksum)
                  VALUES (%s,1,%s,%s,%s,%s,%s,'GLOBAL','2026-01-01',%s,%s,%s,%s,%s)"""
        for rule in inventory["rules"]:
            cur.execute(query,(rule["rule_id"],rule["owner"],rule["domain"],"NEXUS",
                 None,None,"DRAFT",rule["requirement"],Jsonb(rule.get("citations",[])),
                 Jsonb(placeholder),"ci-"+rule["rule_id"]))
        cur.execute(query,("QA-002","adverse_event_extraction","ae","CLIENT",
                    "tenant_A","client_A","APPROVED","CI synthetic approved source-backed test policy",
                    Jsonb([]),Jsonb(synthetic),"ci-synthetic-approved"))
        cur.execute(query,("QA-PLACEHOLDER","adverse_event_extraction","ae","CLIENT",
                    "tenant_A","client_A","DRAFT","CI placeholder must not be approved",
                    Jsonb([]),Jsonb(placeholder),"ci-placeholder"))
        cur.execute("SELECT count(*) FROM public.nexus_clinical_rule_revisions WHERE approval_status='DRAFT'")
        assert cur.fetchone()[0] == 36
print("Prepared 35 inactive expert rules and isolated CI-only approval/denial fixtures.")
