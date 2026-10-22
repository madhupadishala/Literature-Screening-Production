"""Authenticated review-only batch. Configured engines only; never synthetic fallbacks."""
import base64
import hashlib
import hmac
import json
import os
import re
from .service import ServiceError
from .runtime_composition import build_workflow_dispatcher
from Agentic_AI.shared.workflow_context import issue_context


def assess_workflow(body,token,*,dispatcher=None,router=None,secret=None,scopes=None):
    if scopes is None:
        if os.environ.get('NEXUS_PV_REVIEW_WORKFLOW_ENABLED')!='true': raise ServiceError(503,'Review workflow is not configured')
        scopes=json.loads(os.environ['NEXUS_PV_SERVICE_TOKEN_SCOPES'])
    grants=next((g for t,g in scopes.items() if hmac.compare_digest(t,token)),[])
    required={'tenantKey','workspaceId','environment','documentId','requestId','sourceSha256','text','receivedAt','sourceLanguage','sourceType','receiptParty','approvedSource'}
    if not isinstance(body,dict) or set(body)!=required or any(not isinstance(body.get(k),str) or not body[k].strip() for k in required-{'approvedSource'}): raise ServiceError(400,'Invalid workflow fields')
    if not grants:raise ServiceError(401,'Service authentication required')
    if not any(g.get('role')=='workflow_runner' and g.get('tenant_id')==body['tenantKey'] and
               g.get('workspace_id')==body['workspaceId'] and g.get('environment')==body['environment'] and
               g.get('client_id')==body['workspaceId'] for g in grants): raise ServiceError(403,'Workflow scope mismatch')
    if len(body['text'])>100000 or hashlib.sha256(body['text'].encode()).hexdigest()!=body['sourceSha256']:raise ServiceError(400,'Source integrity mismatch')
    secret=secret or os.environ['NEXUS_WORKFLOW_SIGNING_SECRET'].encode()
    if router is None:
        from backend.knowledge.knowledge_router import KnowledgeRouter
        router=KnowledgeRouter(environment=body['environment'])
    dispatcher=dispatcher or build_workflow_dispatcher(secret=secret,router=router,environment=body["environment"])
    if len(dispatcher.specialists)!=27:raise ServiceError(503,'Complete native engine composition required')
    doc=body['documentId'];text=body['text'];workspace=body['workspaceId'];tenant=body['tenantKey']
    pack=router.build_context_pack(tenant_id=tenant,client_id=workspace,agent_name='AG01',task='document_to_case',evidence_package={'document_id':doc,'text':text})
    if pack.tenant_id!=tenant or getattr(pack,'client_id',None)!=workspace:raise ServiceError(403,'Knowledge scope mismatch')
    approved=body['approvedSource']
    if not isinstance(approved,dict) or set(approved)!={'patients','reporters','products','events'} or any(not isinstance(v,list) or len(v)>200 for v in approved.values()):raise ServiceError(400,'Invalid approved source snapshot')
    products=[p['reported_name'] for p in approved['products'] if isinstance(p,dict) and isinstance(p.get('reported_name'),str)]
    events=[e['reported_term'] for e in approved['events'] if isinstance(e,dict) and isinstance(e.get('reported_term'),str)]
    if not events:raise ServiceError(409,'Verified source event required for labeling and assessment')
    drugs=[{'name':p['reported_name'],'role':{'SUSPECT':'suspect','INTERACTING':'interacting','CONCOMITANT':'concomitant'}[p['role_characterization']]} for p in approved['products'] if p.get('role_characterization') in ('SUSPECT','INTERACTING','CONCOMITANT')]
    evidence={'document_id':doc,'case_id':doc,'text':text,'source_type':'other','source_language':body['sourceLanguage'],'target_language':'English',
        'candidate_drugs':products,'case':{'case_id':doc,'narrative':text,'drugs':drugs,'events':[{'verbatim':e} for e in events]},
        'article':{'record_id':doc,'abstract':text},
        'event_request':{'document_id':doc,'case':{'case_id':doc,'documents':[{'id':doc,'media_type':'text/plain','content_base64':base64.b64encode(text.encode()).decode()}]}},
        'seriousness_case':{'case_id':doc,'narrative':text,'event_terms':events},
        'causality_case':{'case_id':doc,'client_id':workspace,'narrative':text,'drugs':drugs,'events':[{'term':e} for e in events]}}
    # Native inputs remain unresolved when source facts are absent; no invented demographics/codes.
    evidence.update(labeling_request={'document_id':doc,'source':{'reportedEvent':events[0],'labelEvidence':[]}},
        safety_request={'document_id':doc,'source':{'sourceCoverage':'ABSTRACT_ONLY','publicationType':'UNKNOWN','humanPopulation':'UNKNOWN',
            'identifiablePatient':'UNKNOWN','products':[],'specialSituations':[],'adverseEventOrReaction':'UNKNOWN','eventEvidence':[]}},
        narrative_request={'document_id':doc,'source':{'caseDraft':{'identification':{'caseKey':doc,'seriousnessStatus':'UNRESOLVED'},'patient':{},'reporters':[],
            'products':[],'events':[],'tests':[],'medicalHistory':[],'additionalInformation':{}}}},
        triage_request={'document_id':doc,'source':{'patients':approved['patients'],'reporters':approved['reporters'],'products':approved['products'],'events':approved['events']}})
    outcomes={}
    evidence['narrative_request']['source']['caseDraft']['products']=[{'reportedName':p['name'],'roleCharacterization':p['role'].upper()} for p in drugs]
    evidence['narrative_request']['source']['caseDraft']['events']=[{'reportedTerm':e} for e in events]
    source_type={'SPONTANEOUS':'spontaneous','CLINICAL_TRIAL':'clinical_trial','LITERATURE':'literature_global','REGULATORY':'regulator','PARTNER':'partner'}.get(body['sourceType'])
    if source_type is None or body['receiptParty'] not in ('mah','delegate','partner'):
        raise ServiceError(409,'Verified clock-start source classification and receipt party required')
    evidence['day_zero_input']={'case_id':doc,'source_type':source_type,'receipts':[{'event_id':doc,'date':body['receivedAt'],'received_by':body['receiptParty'],'text':text}],'seriousness':None}
    for agent in sorted(dispatcher.registry):
        envelope=issue_context(verified_principal='nexus-workflow-service',authorized_tenant=tenant,authorized_client=workspace,
            module_id='intake_triage' if agent in ('AG09','AG17','AG26') else 'case_processing',document_id=doc,
            workflow_id=body['requestId'],job_id=body['requestId']+'-'+agent,agent_id=agent,task_type='document_to_case',signing_secret=secret)
        result=dispatcher.execute(agent,envelope=envelope,evidence=evidence,expected_tenant=tenant,expected_client=workspace)
        outcomes[agent]=result['result']
    return {**{k:body[k] for k in required if k not in ('text','approvedSource')},'outcomes':outcomes,'clinical_release_authorized':False}
