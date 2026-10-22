import unittest
from backend.services.pv_agents.vector_readiness import probe_vector

class VectorProbeTests(unittest.TestCase):
    def test_not_configured_never_reports_ready(self):
        self.assertFalse(probe_vector(environ={})['vector_ready'])
    def test_real_roundtrip_protocol_and_cleanup(self):
        calls=[]; points={}
        def server(method,path,body=None):
            calls.append((method,path,body))
            if method=='GET': return {'result':{'status':'green'}}
            if method=='PUT':
                points[body['points'][0]['id']]=body['points'][0]
                return {'result':{'status':'completed'}}
            if '/search' in path:
                value=body['filter']['must'][0]['match']['value']
                return {'result':[{'id':value,'score':1.0}]} if value in points else {'result':[]}
            for key in body['points']: points.pop(key,None)
            return {'result':{'status':'completed'}}
        result=probe_vector(environ={'QDRANT_URL':'http://qdrant:6333'},transport=server)
        self.assertTrue(result['vector_ready']); self.assertEqual(result['index_status'],'synced')
        self.assertFalse(result['clinical_index_verified']);self.assertEqual(points,{})
        self.assertEqual(len(calls),4)
    def test_failed_readback_still_cleans_up(self):
        calls=[]
        def server(method,path,body=None):
            calls.append(path)
            return {'result':{'status':'green' if method=='GET' else 'completed'}} if '/search' not in path else {'result':[]}
        self.assertFalse(probe_vector(environ={'QDRANT_URL':'http://qdrant:6333'},transport=server)['vector_ready'])
        self.assertTrue(calls[-1].endswith('/delete?wait=true'))
    def test_no_caller_selected_clinical_collection(self):
        self.assertFalse(probe_vector(environ={'QDRANT_URL':'http://qdrant:6333','NEXUS_VECTOR_PROBE_COLLECTION':'clinical'})['vector_ready'])
