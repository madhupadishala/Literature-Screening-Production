"""Fail-closed blinded benchmark runner. Expert labels must be supplied externally."""
import json
from pathlib import Path
from .benchmark import evaluate

def qualify(reference_path, predictions_path):
    if not Path(reference_path).is_file():
        return {'status':'blocked','reason':'adjudicated_expert_reference_missing','clinical_qualification':False}
    reference=json.loads(Path(reference_path).read_text())
    if reference.get('dataset_kind')!='expert_adjudicated' or reference.get('split')!='blinded_test' or len(set(reference.get('reviewer_ids',[])))<2 or not reference.get('adjudication_complete'):
        raise ValueError('Two reviewers, completed adjudication and blinded test reference required')
    if not Path(predictions_path).is_file():
        return {'status':'blocked','reason':'live_model_predictions_missing','clinical_qualification':False}
    predictions=json.loads(Path(predictions_path).read_text())
    if predictions.get('source')!='live_model' or not predictions.get('model') or not predictions.get('dataset_sha256'):
        raise ValueError('Live model provenance required')
    if reference.get('dataset_sha256')!=predictions['dataset_sha256']:
        raise ValueError('Reference and prediction source datasets differ')
    if not reference.get('labels'):
        raise ValueError('Empty reference is not a qualification benchmark')
    score=evaluate(reference['labels'],predictions['labels'])
    return {'status':'scored_pending_expert_acceptance','model':predictions['model'],**score}

if __name__=='__main__':
    import sys
    output=qualify(sys.argv[1],sys.argv[2])
    print(json.dumps(output,indent=2))
    sys.exit(3 if output['status']=='blocked' else 0)
