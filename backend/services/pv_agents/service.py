"""Authenticated WSGI service for shared PV agents. No auto-release.
Mount a durable audit database and issue tokens with explicit tenant/client/workspace scopes.
External seriousness/causality decision workers must be registered by the service host;
the KB adapter alone is never exposed as a completed causality assessment.
"""
import hashlib
import hmac
import json
import math
import os
import sqlite3
from uuid import uuid4
from datetime import date
from dataclasses import asdict
from backend.engines.causality.nexus_kb_adapter import NexusCausalityKnowledgeAdapter, CausalityKnowledgeRequest

from backend.agents.drug_role.nexus_agent import NexusDrugRoleAgent


class ServiceError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


class AuditStore:
    def __init__(self, path):
        if not path:
            raise ValueError("A durable PV audit database path is required")
        self.path = path
        with sqlite3.connect(path) as db:
            db.execute("""CREATE TABLE IF NOT EXISTS pv_agent_audit (
                audit_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, client_id TEXT NOT NULL,
                workspace_id TEXT NOT NULL, request_id TEXT NOT NULL, agent TEXT NOT NULL,
                input_sha256 TEXT NOT NULL, output_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id,client_id,request_id))""")

    def append(self, request, agent, output):
        audit_id = str(uuid4())
        output["audit_id"] = audit_id
        try:
            with sqlite3.connect(self.path) as db:
                db.execute("INSERT INTO pv_agent_audit (audit_id,tenant_id,client_id,workspace_id,request_id,agent,input_sha256,output_json) VALUES (?,?,?,?,?,?,?,?)",
                           (audit_id, request['tenant_id'], request['client_id'], request['workspace_id'], request['request_id'], agent, output['input_sha256'], json.dumps(output, sort_keys=True, allow_nan=False)))
        except sqlite3.IntegrityError as exc:
            raise ServiceError(409, "Request ID already recorded") from exc
        return output


class PVAgentService:
    def __init__(self, token_scopes, audit_store, drug_agent=None, workers=None, causality_adapter=None):
        self.token_scopes, self.audit = token_scopes, audit_store
        self.drug_agent = drug_agent or NexusDrugRoleAgent()
        self.workers = workers or {}
        self.causality_adapter = causality_adapter or NexusCausalityKnowledgeAdapter()

    def assess(self, agent, request, token):
        # Bearer possession does not imply tenant authority; scope must match trusted registration.
        scopes = next((v for k, v in self.token_scopes.items() if hmac.compare_digest(k, token)), None)
        if not scopes:
            raise ServiceError(401, "Service authentication required")
        allowed = {'tenant_id','client_id','workspace_id','request_id','case_id','narrative','source_type','event_terms','input_sha256'}
        if not isinstance(request, dict) or set(request) - allowed:
            raise ServiceError(400, "Invalid agent request fields")
        for key in ['tenant_id','client_id','workspace_id','request_id','case_id','narrative','input_sha256']:
            if not isinstance(request.get(key), str) or not request[key].strip():
                raise ServiceError(400, f"{key} required")
        if not any(all(s.get(k) == request[k] for k in ['tenant_id','client_id','workspace_id']) for s in scopes):
            raise ServiceError(403, "Service token scope mismatch")
        digest = hashlib.sha256(request['narrative'].encode()).hexdigest()
        if digest != request['input_sha256']:
            raise ServiceError(400, "Source hash mismatch")
        if agent == 'drug-role':
            result = self.drug_agent.run(request['tenant_id'], {'case_id':request['case_id'], 'evidence_package_id':request['request_id'], 'text':request['narrative'], 'source_type':request.get('source_type','unknown')}, client_id=request['client_id'])
            confidence = min((c['confidence'] for c in result['classifications']), default=0.0)
            evidence = [e for c in result['classifications'] for e in c['evidence']]
            version = result['knowledge_context'].get('version', 'unqualified-nexus-kb')
        elif agent in ('seriousness', 'causality') and agent in self.workers:
            worker_request = dict(request)
            if agent == 'causality':
                context = self.causality_adapter.retrieve(CausalityKnowledgeRequest(
                    tenant_id=request['tenant_id'], client_id=request['client_id'],
                    query=request['narrative'], knowledge_types=('general_pv','tenant_override','product_master'),
                    jurisdiction='GLOBAL', as_of=date.today()))
                worker_request['knowledge_context'] = asdict(context)
            result = self.workers[agent](worker_request)
            if not isinstance(result, dict) or result.get('review_required') is not True:
                raise ServiceError(502, "Unqualified worker response")
            confidence, evidence, version = result.get('confidence',0), result.get('evidence_spans',[]), result.get('knowledge_version','unqualified')
        else:
            raise ServiceError(503, "Agent decision worker is not configured")
        if not isinstance(confidence, (int, float)) or isinstance(confidence, bool) or not math.isfinite(confidence) or not 0 <= confidence <= 1 or not isinstance(evidence, list) or not isinstance(version, str) or not version:
            raise ServiceError(502, 'Invalid worker evidence/confidence contract')
        for span in evidence:
            if not isinstance(span, dict) or not isinstance(span.get('start'), int) or not isinstance(span.get('end'), int) or not 0 <= span['start'] <= span['end'] <= len(request['narrative']) or request['narrative'][span['start']:span['end']] != span.get('text'):
                raise ServiceError(502, 'Ungrounded worker evidence')
        output = {'schema_version':'nexus.pv-agent/1','agent':agent, **{k:request[k] for k in ['tenant_id','client_id','workspace_id','request_id','case_id']}, 'input_sha256':digest, 'confidence':confidence, 'route':'hitl', 'review_required':True, 'evidence_spans':evidence, 'knowledge_version':version, 'result':result}
        if agent == 'seriousness':
            output.update({k: result[k] for k in ('decision', 'criteria_met', 'review_reasons', 'explanation')})
            output['execution_id'] = str(uuid4())
        return self.audit.append(request, agent, output)

    def __call__(self, environ, start_response):
        statuses={200:'OK',400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',409:'Conflict',413:'Payload Too Large',502:'Bad Gateway',503:'Service Unavailable'}
        try:
            path=environ.get('PATH_INFO','').split('/')
            if environ.get('REQUEST_METHOD')!='POST' or len(path)!=5 or path[:3]!=['','v1','agents'] or path[4]!='assess':
                raise ServiceError(404, 'Unknown agent route')
            if os.environ.get('NEXUS_PV_AGENTS_ENABLED')!='true':
                raise ServiceError(503, 'Shared agents disabled pending qualification')
            length=int(environ.get('CONTENT_LENGTH') or 0)
            if length<1 or length>2_000_000:raise ServiceError(413,'Invalid request size')
            auth=environ.get('HTTP_AUTHORIZATION','')
            if not auth.startswith('Bearer '):raise ServiceError(401,'Service authentication required')
            request=json.loads(environ['wsgi.input'].read(length))
            if isinstance(request, dict) and 'input_sha256' not in request and environ.get('HTTP_X_INPUT_SHA256'):
                request['input_sha256'] = environ['HTTP_X_INPUT_SHA256']
            output=self.assess(path[3],request,auth[7:]);status=200
        except ServiceError as exc:status=exc.status;output={'error':exc.message,'route':'hitl'}
        except (ValueError, TypeError):status=400;output={'error':'Invalid request','route':'hitl'}
        except Exception:status=503;output={'error':'Agent unavailable; human review required','route':'hitl'}
        body=json.dumps(output,allow_nan=False).encode()
        start_response(f'{status} {statuses[status]}',[('Content-Type','application/json'),('Cache-Control','no-store'),('Content-Length',str(len(body)))])
        return [body]


def create_application():
    app = PVAgentService(json.loads(os.environ['NEXUS_PV_SERVICE_TOKEN_SCOPES']), AuditStore(os.environ['NEXUS_PV_AUDIT_DB']))
    if os.environ.get('NEXUS_PV_REGISTER_SPECIALISTS') == 'true':
        from .workers import build_specialist_workers
        app.workers = build_specialist_workers(app.drug_agent, app.causality_adapter, os.environ['NEXUS_PV_SPECIALIST_AUDIT_DIR'])
    return app
