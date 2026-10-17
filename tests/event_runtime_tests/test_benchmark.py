import pytest
from backend.agents.event_runtime.benchmark import evaluate
from backend.agents.event_runtime.audit import AuditStore
from .test_agent import run

def record(start=0, patient="d1:P001"):
    return dict(case_id="c",patient_id=patient,document_id="d1",block_id="b",start=start,end=start+5)

def test_missing_and_wrong_patient_count_as_errors():
    out=evaluate([record(),record(20)],[record(),record(20,"d1:P002")])
    assert out["true_positive"]==1
    assert out["false_positive"]==out["false_negative"]==1
    assert out["precision"]==out["recall"]==0.5

def test_empty_denominators_not_reported_as_perfect():
    assert evaluate([],[])["recall"] is None

def test_duplicate_labels_rejected():
    with pytest.raises(ValueError): evaluate([record(),record()],[])

def test_audit_tamper_detection(tmp_path):
    store=AuditStore(str(tmp_path/"a.sqlite"))
    store.save("tenant","key","hash",run())
    assert store.verify("tenant")
    with store.connect() as db:
        db.execute("UPDATE audit SET digest='changed'")
    assert not store.verify("tenant")
