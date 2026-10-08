"""Score the original Nexus output after unblinding. FAERS is report-level reference.
No scorer output claims expert gold or clinical qualification without adjudication.
"""
import hashlib
import json
import re

ROLE_CODES = {'openfda': {'1':'SUSPECT','2':'CONCOMITANT','3':'INTERACTING'},
              'faers_ascii': {'PS':'SUSPECT','SS':'SUSPECT','C':'CONCOMITANT','I':'INTERACTING'}}
ROLES = {'SUSPECT','CONCOMITANT','INTERACTING','HISTORICAL','TREATMENT','UNKNOWN'}

def norm(value): return re.sub(r'\s+', ' ', str(value).strip().casefold())
def ratio(n, d): return n / d if d else None

def metrics(expected, predicted):
    tp, fp, fn = len(expected & predicted), len(predicted - expected), len(expected - predicted)
    return dict(tp=tp, fp=fp, fn=fn, precision=ratio(tp,tp+fp), recall=ratio(tp,tp+fn), f1=ratio(2*tp,2*tp+fp+fn))

def score(reference, output, dialect):
    if dialect not in ROLE_CODES: raise ValueError('Explicit reference dialect required')
    if output.get('schema_version') == 'nexus.pv-agent/1':
        if output.get('agent') != 'drug-role': raise ValueError('Drug-role output required')
        output = {**output['result'], 'case_id': output['case_id']}
    if not isinstance(output.get('classifications'), list): raise ValueError('Original Nexus classifications contract required')
    if dialect == 'openfda':
        rows = reference.get('faers_drugs')
        rid = reference.get('case_id') or reference.get('safetyreportid')
        name_key, role_key = 'medicinalproduct', 'drugcharacterization'
    else:
        data = reference.get('faers_reference', {})
        rows, rid = data.get('drugs'), data.get('primaryid')
        name_key, role_key = 'product', 'faers_role'
    if not isinstance(rows, list) or not rows: raise ValueError('Empty references cannot be scored')
    if str(rid) != str(output.get('case_id')): raise ValueError('Case identity mismatch')
    expected = set()
    for row in rows:
        code, name = str(row.get(role_key)), norm(row.get(name_key) or '')
        if code not in ROLE_CODES[dialect] or not name: raise ValueError('Invalid reference role/name')
        expected.add((name, ROLE_CODES[dialect][code]))
    predicted = set()
    for row in output['classifications']:
        name, role = norm(row.get('normalized_name') or ''), row.get('role')
        if not name or role not in ROLES: raise ValueError('Invalid classification contract')
        predicted.add((name, role))
    return {'status':'UNADJUDICATED_REPORT_LEVEL_COMPARISON', 'dialect':dialect,
            'extraction':metrics({n for n,_ in expected},{n for n,_ in predicted}),
            'roles':{r:metrics({n for n,x in expected if x==r},{n for n,x in predicted if x==r}) for r in ('SUSPECT','CONCOMITANT','INTERACTING')},
            'mismatches':[list(x) for x in sorted(expected ^ predicted)],
            'ownership_accuracy':None, 'drug_event_pair_accuracy':None, 'expert_review_completed':False,
            'limitations':['Exact names only; normalization requires a separately controlled mapping.',
                           'FAERS roles do not label historical, treatment, ownership, or drug-event pairs.',
                           'Article-to-patient linkage and source-visible versus follow-up-only drugs require adjudication.']}

def infer_source(input_path, output_path):
    """Source-only entry point: rejects all reference/candidate/ownership inputs."""
    from pathlib import Path
    from backend.agents.drug_role.orchestrator import DrugRoleOrchestrator
    source = json.loads(Path(input_path).read_text())
    allowed = {'case_id','tenant_id','source_type','narrative','input_sha256'}
    if set(source) != allowed: raise ValueError('Source-only input contract violated')
    digest = hashlib.sha256(source['narrative'].encode()).hexdigest()
    if digest != source['input_sha256']: raise ValueError('Source hash changed')
    result = DrugRoleOrchestrator().classify(case_id=source['case_id'], tenant_id=source['tenant_id'],
        source_type=source['source_type'], text=source['narrative']).to_dict()
    result['input_sha256'] = digest
    Path(output_path).write_text(json.dumps(result, indent=2, allow_nan=False))

if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser(); p.add_argument('input'); p.add_argument('output')
    a = p.parse_args(); infer_source(a.input, a.output)
