import json
import hashlib
import pytest
from backend.validation.drug_role_benchmark import score, infer_source

def test_openfda_role_three_is_interacting_and_undefined_metrics_are_null():
    ref={'case_id':'c','faers_drugs':[{'medicinalproduct':'X','drugcharacterization':'3'}]}
    result=score(ref, {'case_id':'c','classifications':[]}, 'openfda')
    assert result['roles']['INTERACTING']['fn']==1
    assert result['roles']['SUSPECT']['precision'] is None
    assert result['extraction']['recall']==0
    assert result['ownership_accuracy'] is None

def test_empty_reference_and_identity_mismatch_rejected():
    with pytest.raises(ValueError): score({'case_id':'c','faers_drugs':[]},{'case_id':'c','classifications':[]},'openfda')
    with pytest.raises(ValueError): score({'case_id':'c','faers_drugs':[{'medicinalproduct':'X','drugcharacterization':'1'}]},{'case_id':'d','classifications':[]},'openfda')

def test_faers_ascii_suspect_mapping():
    ref={'faers_reference':{'primaryid':'1','drugs':[{'product':'X','faers_role':'SS'}]}}
    result=score(ref, {'case_id':'1','classifications':[{'normalized_name':'X','role':'SUSPECT'}]},'faers_ascii')
    assert result['roles']['SUSPECT']['f1']==1

def test_inference_rejects_reference_leakage(tmp_path):
    text='Aspirin was suspected.'
    source={'case_id':'c','tenant_id':'validation','source_type':'literature','narrative':text,'input_sha256':hashlib.sha256(text.encode()).hexdigest()}
    path=tmp_path/'source.json';out=tmp_path/'output.json'
    path.write_text(json.dumps({**source,'faers_drugs':[]}))
    with pytest.raises(ValueError): infer_source(path,out)
    assert not out.exists()
    path.write_text(json.dumps(source));infer_source(path,out)
    assert json.loads(out.read_text())['classifications'][0]['role']=='SUSPECT'
