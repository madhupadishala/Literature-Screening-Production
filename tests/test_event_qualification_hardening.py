import json
from types import SimpleNamespace
import pytest
from backend.agents.event_runtime.audit import AuditStore
from backend.agents.event_runtime.qualification import qualify
from backend.agents.event_runtime.live_validation import smoke_passed
from tests.event_runtime_tests.test_agent import run

def test_deleted_audit_row_detected(tmp_path):
    audit=AuditStore(str(tmp_path/'audit.sqlite'))
    audit.save('tenant','request','sha',run())
    with audit.connect() as db:db.execute('DELETE FROM audit')
    assert not audit.verify('tenant')

def test_duplicate_run_id_detected(tmp_path):
    audit=AuditStore(str(tmp_path/'audit.sqlite'));result=run()
    audit.save('tenant','one','sha',result);audit.save('tenant','two','sha',result)
    assert not audit.verify('tenant')

@pytest.mark.parametrize('reviewers',['AB',[],['',' '],['A','A'],['A',None],[' A ','A'],[1,2]])
def test_invalid_reviewer_ids_rejected(tmp_path,reviewers):
    reference=tmp_path/'reference.json'
    reference.write_text(json.dumps(dict(dataset_kind='expert_adjudicated',split='blinded_test',reviewer_ids=reviewers,adjudication_complete=True)))
    with pytest.raises(ValueError):qualify(reference,tmp_path/'predictions.json')

def test_two_valid_reviewers_reach_missing_predictions_gate(tmp_path):
    path=tmp_path/'reference.json'
    path.write_text(json.dumps(dict(dataset_kind='expert_adjudicated',split='blinded_test',reviewer_ids=['A','B'],adjudication_complete=True)))
    assert qualify(path,tmp_path/'predictions.json')['reason']=='live_model_predictions_missing'

def event(term='nausea',patient='synthetic-source:P001'):
    return SimpleNamespace(verbatim=term,patient_id=patient,assertion='affirmed')

def test_live_smoke_exact_expected_patient_event():
    assert smoke_passed(SimpleNamespace(status='review_required',events=[event()]))
    assert not smoke_passed(SimpleNamespace(status='review_required',events=[event(patient='wrong')]))
    assert not smoke_passed(SimpleNamespace(status='review_required',events=[event(),event('headache')]))
    assert not smoke_passed(SimpleNamespace(status='incomplete',events=[event()]))
