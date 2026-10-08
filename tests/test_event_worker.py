import hashlib
import sqlite3
from types import SimpleNamespace
import pytest
from backend.services.pv_agents.service import PVAgentService, AuditStore, ServiceError
from backend.services.pv_agents.event_worker import EventWorker
from backend.agents.event_runtime.engine import EventEngine
from tests.event_runtime_tests.test_agent import ScriptedProvider

class Router:
    def build_context_pack(self,**kwargs):
        self.scope=(kwargs['tenant_id'],kwargs['client_id'])
        return SimpleNamespace(citations=[{'rule_id':'software-test-only','source':'test'}])

def make(tmp_path):
    router=Router()
    worker=EventWorker(EventEngine(ScriptedProvider()),router)
    service=PVAgentService({'secret':[{'tenant_id':'tenant','client_id':'client','workspace_id':'workspace'}]},
        AuditStore(str(tmp_path/'audit.sqlite')),drug_agent=SimpleNamespace(),causality_adapter=SimpleNamespace(),workers={'event-extraction':worker})
    text='Patient P001 developed nausea.'
    body=dict(tenant_id='tenant',client_id='client',workspace_id='workspace',case_id='c',request_id='r',narrative=text,input_sha256=hashlib.sha256(text.encode()).hexdigest())
    return service,body,router

def test_event_worker_shared_scope_evidence_and_audit(tmp_path):
    service,body,router=make(tmp_path)
    out=service.assess('event-extraction',body,'secret')
    assert out['agent']=='event-extraction' and out['route']=='hitl'
    assert out['result']['events'][0]['verbatim']=='nausea'
    assert out['evidence_spans'][0]['text']=='nausea'
    assert router.scope==('tenant','client')
    assert out['audit_id']

@pytest.mark.parametrize('field',['tenant_id','client_id','workspace_id'])
def test_foreign_scope_rejected_before_worker(tmp_path,field):
    service,body,_=make(tmp_path);body[field]='foreign'
    with pytest.raises(ServiceError) as error:service.assess('event-extraction',body,'secret')
    assert error.value.status==403

def test_source_hash_rejected(tmp_path):
    service,body,_=make(tmp_path);body['input_sha256']='bad'
    with pytest.raises(ServiceError) as error:service.assess('event-extraction',body,'secret')
    assert error.value.status==400

def test_qualification_requires_actual_expert_reference(tmp_path):
    from backend.agents.event_runtime.qualification import qualify
    assert qualify(tmp_path/'absent.json',tmp_path/'predictions.json')['status']=='blocked'

def test_generated_reference_cannot_qualify(tmp_path):
    import json
    from backend.agents.event_runtime.qualification import qualify
    path=tmp_path/'ref.json';path.write_text(json.dumps({'dataset_kind':'synthetic'}))
    with pytest.raises(ValueError):qualify(path,tmp_path/'pred.json')

def test_offline_schema_pinning_and_validation(tmp_path):
    import json
    from backend.agents.event_runtime.xml_validation import SchemaBundle
    source=b'<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="test" type="xs:string"/></xs:schema>'
    path=tmp_path/'test.xsd';path.write_bytes(source)
    manifest=tmp_path/'manifest.json';manifest.write_text(json.dumps({'approved':True,'version':'software-test-only','entrypoint':'test.xsd','sha256':{'test.xsd':hashlib.sha256(source).hexdigest()}}))
    schema=SchemaBundle(tmp_path,manifest)
    assert schema.validate(b'<test>text</test>')['schema_validated']
    path.write_bytes(b'altered')
    with pytest.raises(ValueError):SchemaBundle(tmp_path,manifest)
