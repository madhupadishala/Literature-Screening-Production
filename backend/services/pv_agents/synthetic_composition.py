"""Fixed synthetic-only 27-slot integration composition.

Real Python engines execute for 19 slots; eight native dependency ports use
explicit fixtures. Never import this composition into a clinical request path.
"""
from types import SimpleNamespace
from Agentic_AI.shared.execution.factory import build_dispatcher
from Agentic_AI.shared.execution.native_runtime_bindings import RUNTIME_ROUTES
from Agentic_AI.shared.workflow_context import issue_context

KEY = b'synthetic-composition-only-never-a-clinical-signing-key'
TEXT = ('Patient ID SYN-17, male, 45 years old. Dr Ada, physician, reported nausea associated with Metformin. '
        'Prior asthma resolved in 2020. Metformin prescribed for diabetes. ALT 120 U/L recorded. Patient was hospitalized.')
DOC = 'SYN-DOC-27'
DEPENDENCY_FIXTURES = frozenset({'AG02','AG08','AG11','AG12','AG13','AG17','AG20','AG26'})

class SyntheticJSONProvider:
    def complete_json(self, *, system, user, schema):
        fields=set(schema.get('properties', {}))
        if 'patient_id' in fields and 'sex_as_stated' in fields:
            return {'patient_id':'SYN-17','sex_as_stated':'male','sex_evidence':'male',
                    'age_at_onset':{'value':45,'unit':'years','evidence':'45 years'}}
        if 'reporters' in fields:
            return {'reporters':[{'given_name':'Ada','occupation_as_stated':'physician','evidence':'Dr Ada, physician'}]}
        if 'events' in fields:
            return {'events':[{'event_id':'receipt-1',
                'reporter':{'present':True,'evidence':'Dr Ada, physician'},
                'patient':{'present':True,'evidence':'Patient ID SYN-17'},
                'product':{'present':True,'evidence':'Metformin'},
                'reaction':{'present':True,'evidence':'nausea'}}]}
        if 'conditions' in fields and 'drugs' in fields:
            return {'conditions':[{'term_as_reported':'asthma','kind':'condition','end_date':'2020',
                'continuing_stated':'no','temporal_phrase':'Prior asthma','evidence':'Prior asthma resolved in 2020'}],'drugs':[]}
        raise ValueError('Unsupported synthetic provider schema')

class SyntheticRouter:
    def build_context_pack(self, *, tenant_id, client_id, **kwargs):
        if tenant_id != 'nexus-staging-tenant' or client_id != 'nexus-staging-client':
            raise PermissionError('Synthetic fixture scope required')
        return SimpleNamespace(tenant_id=tenant_id,client_id=client_id,citations=[{'rule_id':'SYN-QA-ONLY','synthetic':True}],
            product_master_matches=[{'trade_name':'Metformin','client_id':client_id}], approved_documents=[])

class SyntheticCandidates:
    def list_candidates(self, *, kind, tenant_id, client_id, limit):
        if (tenant_id,client_id) != ('nexus-staging-tenant','nexus-staging-client'): raise PermissionError('Synthetic scope required')
        # Non-empty corpus ensures the actual pair-comparison engines are invoked.
        record={'case_id':'SYN-OLDER','worldwide_unique_id':'SYN-WW-1'} if kind=='icsr' else {'record_id':'SYN-OLDER','pmid':'SYN-PMID-1'}
        return [{'record_id':'SYN-OLDER','tenant_id':tenant_id,'client_id':client_id,'record':record}]

class NativeDependencyFixture:
    def __init__(self, agent): self.agent=agent
    def execute(self, request):
        return {**{k:request[k] for k in ('agent_id','document_id','tenant_id','client_id')},
            'status':'review_required','requires_human_review':True,
            'assessment':{'dependency_mode':'fixture','native_engine_executed':False,'qualified_for_autonomous_use':False}}

def pipeline_fixture(agent):
    def run(*, evidence, knowledge_pack):
        return {'agent_id':agent,'document_id':evidence['document_id'],'tenant_id':knowledge_pack.tenant_id,
            'client_id':knowledge_pack.client_id,'status':'review_required','requires_human_review':True,
            'assessment':{'dependency_mode':'fixture','native_engine_executed':False,'qualified_for_autonomous_use':False}}
    return run

def synthetic_evidence():
    evidence={'document_id':DOC,'case_id':DOC,'text':TEXT,'title':'Synthetic safety case','source_type':'spontaneous',
        'candidate_drugs':['Metformin'],'source_language':'English','target_language':'English',
        'case':{'case_id':DOC,'narrative':TEXT,'worldwide_unique_id':'SYN-WW-1',
                'drugs':[{'name':'Metformin','role':'suspect'}],'events':[{'verbatim':'nausea'}]},
        'article':{'record_id':DOC,'pmid':'SYN-PMID-1','title':'Synthetic case report','abstract':TEXT,'mentions_products':['Metformin']},
        'day_zero_input':{'case_id':DOC,'source_type':'spontaneous','receipts':[{'event_id':'receipt-1','date':'2026-10-01','received_by':'mah','text':TEXT}],'seriousness':None}}
    for agent,route in RUNTIME_ROUTES.items():
        if route['input']!='text': evidence[route['input']]={'document_id':DOC,'source':{'text':TEXT},'case':{'case_id':DOC,'documents':[{'id':'SYN-SOURCE'}]}}
    return evidence

def run_synthetic_composition():
    dispatcher=build_dispatcher(signing_secret=KEY,router=SyntheticRouter(),approved_llm=SyntheticJSONProvider(),
        duplicate_repository=SyntheticCandidates(),native_runtimes={a:NativeDependencyFixture(a) for a in RUNTIME_ROUTES},
        specialist_services={a:pipeline_fixture(a) for a in ('AG11','AG13')})
    outcomes={}
    for agent in sorted(dispatcher.registry):
        module='case_processing'
        if agent in ('AG09','AG17','AG26'): module='intake_triage'
        envelope=issue_context(verified_principal='synthetic-runner',authorized_tenant='nexus-staging-tenant',
            authorized_client='nexus-staging-client',module_id=module,document_id=DOC,workflow_id='SYN-WF',
            job_id='SYN-'+agent,agent_id=agent,task_type='synthetic_composition',signing_secret=KEY)
        try:
            output=dispatcher.execute(agent,envelope=envelope,evidence=synthetic_evidence(),
                expected_tenant='nexus-staging-tenant',expected_client='nexus-staging-client')
            if output['result']['status']!='review_required': raise ValueError('Review contract failed')
            outcomes[agent]={'status':'passed','engine_mode':'native_dependency_fixture' if agent in DEPENDENCY_FIXTURES else 'python_engine_with_fixture_dependencies'}
        except Exception as exc:
            outcomes[agent]={'status':'failed','error_type':type(exc).__name__}
    return {'diagnostic':'synthetic_composition','synthetic_only':True,'clinical_release_authorized':False,
        'total_slots':27,'dry_run_slots_passed':sum(x['status']=='passed' for x in outcomes.values()),
        'actual_python_engine_slots':19,'native_dependency_fixture_slots':8,'knowledge_retrieval_proven':False,'outcomes':outcomes}

if __name__=='__main__':
    import json
    result=run_synthetic_composition();print(json.dumps(result,indent=2))
    raise SystemExit(0 if result['dry_run_slots_passed']==27 else 1)
