"""Plan a scoped index migration without inventing client ownership or approvals."""
import hashlib
import json
from pathlib import Path
from datetime import date
from backend.knowledge.vector_indexer import VectorIndexer

def plan(root):
    root=Path(root); parser=VectorIndexer.__new__(VectorIndexer); records=[]
    for folder, kind in [('Rules','general_pv'), ('Clients','tenant_override')]:
        for path in sorted((root/folder).rglob('*.md')):
            data=parser._parse_markdown_file(str(path));missing=[]
            required=['rule_id','version','effective_date','agent_scope','country_scope','source_document']
            if kind=='tenant_override':required.append('client_id')
            missing.extend(k for k in required if not data.get(k))
            if data.get('effective_date'):
                try:date.fromisoformat(str(data['effective_date']))
                except ValueError:missing.append('valid_effective_date')
            if data.get('expiry_date'):
                try:date.fromisoformat(str(data['expiry_date']))
                except ValueError:missing.append('valid_expiry_date')
            if kind=='tenant_override' and len(path.relative_to(root/'Clients').parts)!=2:missing.append('unambiguous_tenant_folder')
            records.append({'path':str(path.relative_to(root)), 'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                'knowledge_type':kind,'tenant_id':path.parent.name if kind=='tenant_override' else 'GLOBAL',
                'client_id':data.get('client_id') if kind=='tenant_override' else 'GLOBAL',
                'action':'QUARANTINE' if missing else 'ELIGIBLE_FOR_STAGED_INDEX', 'missing':missing,
                'version':data.get('version'), 'effective_date':data.get('effective_date')})
    return {'schema_version':'nexus.knowledge-migration/1','production_applied':False,
            'records':records,'eligible':sum(r['action']=='ELIGIBLE_FOR_STAGED_INDEX' for r in records),
            'quarantined':sum(r['action']=='QUARANTINE' for r in records),
            'promotion_requirement':'Build a new index, verify scope and retrieval, then switch the configured knowledge path. Preserve the old index for rollback.'}

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('output');a=p.parse_args()
    Path(a.output).write_text(json.dumps(plan(a.root),indent=2))


def build_staged_index(root, destination, tenant_id):
    """Build a fresh staging directory; never mutate or switch the production index."""
    import shutil
    destination=Path(destination)
    if destination.exists(): raise ValueError('Staging destination must be new')
    inventory=plan(root); destination.mkdir(parents=True)
    for row in inventory['records']:
        if row['action']=='ELIGIBLE_FOR_STAGED_INDEX' and row['tenant_id'] in ('GLOBAL',tenant_id):
            target=destination/row['path'];target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(Path(root)/row['path'],target)
    index=VectorIndexer(str(destination)); index.rebuild_index(tenant_id)
    receipt={**inventory,'staged_index_records':index.collection.count(),'production_applied':False}
    (destination/'migration-receipt.json').write_text(json.dumps(receipt,indent=2))
    return receipt
