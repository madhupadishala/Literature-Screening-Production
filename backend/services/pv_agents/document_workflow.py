"""Document-to-review orchestration. Trusted host supplies dispatcher, index and persistence.

No default engines, provider fallbacks, automatic review approval, or transmission.
Scope originates in a verified Nexus principal, not document metadata.
"""
from dataclasses import dataclass
from hashlib import sha256
from Agentic_AI.shared.workflow_context import issue_context

EXTRACTION=('AG01','AG02','AG03','AG04','AG05','AG06','AG07','AG08','AG09','AG10','AG24')
ASSESSMENT=('AG11','AG12','AG13','AG14','AG15','AG16','AG17','AG18','AG19','AG21','AG22','AG23','AG25','AG26','AG27','AG20')

@dataclass(frozen=True)
class VerifiedScope:
    tenant_key: str
    workspace_id: str
    principal_id: str
    environment: str
    def __post_init__(self):
        if not all(isinstance(v,str) and v.strip() for v in (self.tenant_key,self.workspace_id,self.principal_id)):
            raise PermissionError('Verified principal scope required')
        if self.environment not in ('PROD','UAT','TRAINING'): raise PermissionError('Verified environment required')

class DocumentWorkflow:
    def __init__(self, *, dispatcher, index, repository, signing_secret):
        self.dispatcher,self.index,self.repository,self.secret=dispatcher,index,repository,signing_secret

    def run(self, *, scope: VerifiedScope, document_id: str, request_id: str, evidence: dict):
        if not isinstance(scope,VerifiedScope): raise PermissionError('Verified scope required')
        if not document_id or not request_id or evidence.get('document_id')!=document_id:
            raise ValueError('Source identity mismatch')
        text=evidence.get('text')
        if not isinstance(text,str) or not 1<=len(text)<=100000: raise ValueError('Bounded document text required')
        forbidden={'tenantKey','workspaceId','tenant_id','client_id','workspace_id','environment'}
        if forbidden.intersection(evidence): raise PermissionError('Document cannot select execution scope')
        digest=sha256(text.encode()).hexdigest()
        # Repositories serialize by scope + idempotency key and reject different hashes.
        with self.repository.transaction(scope=scope,request_id=request_id,source_sha256=digest) as tx:
            existing=tx.existing()
            if existing is not None:return existing
            trace=[]
            def event(stage, **details):
                entry={'sequence':len(trace)+1,'stage':stage,'tenantKey':scope.tenant_key,
                    'workspaceId':scope.workspace_id,'environment':scope.environment,**details}
                entry['audit_id']=tx.audit(entry)
                trace.append(entry)
            tx.intake(document_id=document_id,source_sha256=digest)
            event('document_intake',document_id=document_id,source_sha256=digest)
            self.index.upsert(scope=scope,document_id=document_id,text=text)
            knowledge=self.index.search(scope=scope,query=text,limit=20)
            for row in knowledge:
                if row.get('tenantKey')!=scope.tenant_key or row.get('workspaceId')!=scope.workspace_id or row.get('environment')!=scope.environment:
                    raise PermissionError('Cross-scope vector result rejected')
            event('scoped_knowledge_retrieval',citation_ids=[r['id'] for r in knowledge],source_sha256=digest)
            results={}
            for phase,agents in [('extraction',EXTRACTION),('assessment_and_deduplication',ASSESSMENT)]:
                for agent in agents:
                    module='intake_triage' if agent in ('AG09','AG17','AG26') else 'case_processing'
                    envelope=issue_context(verified_principal=scope.principal_id,authorized_tenant=scope.tenant_key,
                        authorized_client=scope.workspace_id,module_id=module,document_id=document_id,
                        workflow_id=request_id,job_id=request_id+'-'+agent,agent_id=agent,
                        task_type='document_to_case',signing_secret=self.secret)
                    result=self.dispatcher.execute(agent,envelope=envelope,evidence=evidence,
                        expected_tenant=scope.tenant_key,expected_client=scope.workspace_id)
                    if result['result']['status']!='review_required':raise ValueError('Agent bypassed mandatory review')
                    results[agent]=result
                    event(phase,agent_id=agent,status='review_required')
            # Draft remains separate from an approved/final case version; persistence
            # adapters must create the real Nexus draft and review task atomically.
            draft_id=tx.create_case_draft(document_id=document_id,agent_results=results,citations=knowledge)
            event('draft_case_created',case_id=draft_id,status='DRAFT')
            review_id=tx.enqueue_review(case_id=draft_id)
            event('review_queue',case_id=draft_id,review_id=review_id,status='PENDING_HUMAN_REVIEW')
            preview_id=tx.stage_submission_preview(case_id=draft_id,transmission_enabled=False)
            event('submission_payload_staged',case_id=draft_id,preview_id=preview_id,status='AWAITING_REVIEW',transmission_enabled=False)
            output={'request_id':request_id,'case_id':draft_id,'review_id':review_id,'preview_id':preview_id,
                'tenantKey':scope.tenant_key,'workspaceId':scope.workspace_id,'environment':scope.environment,
                'source_sha256':digest,'status':'PENDING_HUMAN_REVIEW','clinical_release_authorized':False,
                'executed_slots':len(results),'trace':trace}
            tx.complete(output)
            return output
