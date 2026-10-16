"""Socket integration and dispatcher denial/audit verification using live local UNIX IPC."""
import json
import os
import socket
import struct
import tempfile
import threading
import unittest
from types import SimpleNamespace

from Agentic_AI.shared.execution.factory import build_dispatcher
from Agentic_AI.shared.execution.node_socket_runtime import NodeSocketRuntime
from Agentic_AI.shared.workflow_context import issue_context, ContextError

KEY=b"synthetic-only-server-issuer-secret-minimum-32-bytes"

class LocalRuntimeServer:
    def __init__(self, path): self.path=path;self.server=socket.socket(socket.AF_UNIX);self.server.bind(path);self.server.listen(2);self.calls=0
    def run_once(self):
        client,_=self.server.accept()
        with client:
            def take(n):
                out=b""
                while len(out)<n:
                    buf=client.recv(n-len(out))
                    if not buf:break
                    out+=buf
                return out
            size=struct.unpack("!I",take(4))[0]
            req=json.loads(take(size))
            self.calls+=1
            response={k:req[k] for k in ("agent_id","document_id","tenant_id","client_id")}
            response.update(status="review_required",requires_human_review=True,assessment={"source":"synthetic-only"})
            buf=json.dumps(response).encode()
            client.sendall(struct.pack("!I",len(buf))+buf)
    def close(self):self.server.close()

class ScopedRouter:
    def __init__(self):self.calls=[]
    def build_context_pack(self,**kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(tenant_id=kwargs["tenant_id"],client_id=kwargs["client_id"],citations=[])

class NativeIPCTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.path=self.tmp.name+"/bridge.sock"
        self.server=LocalRuntimeServer(self.path);self.addCleanup(self.server.close)
        self.router=ScopedRouter();self.audit=[]
        self.dispatcher=build_dispatcher(signing_secret=KEY,router=self.router,
            native_runtimes={"AG08":NodeSocketRuntime("AG08",socket_path=self.path)},
            audit_failure=self.audit.append)
        self.payload={"document_id":"SYN-1","text":"synthetic source only"}
    def envelope(self,client="client-a"):
        return issue_context(verified_principal="synthetic",
            authorized_tenant="tenant-a",authorized_client=client,
            module_id="intake_triage",document_id="SYN-1",
            workflow_id="wf",job_id="job",agent_id="AG08",task_type="extract",
            signing_secret=KEY)
    def test_real_socket_round_trip(self):
        worker=threading.Thread(target=self.server.run_once,daemon=True);worker.start()
        out=self.dispatcher.execute("AG08",envelope=self.envelope(),evidence=self.payload,
            expected_tenant="tenant-a",expected_client="client-a")
        worker.join(timeout=3)
        self.assertEqual(out["result"]["status"],"review_required")
        self.assertEqual(out["result"]["assessment"]["assessment"]["source"],"synthetic-only")
        self.assertEqual(self.server.calls,1)
    def test_cross_client_aborts_audits_before_socket_call(self):
        with self.assertRaises(ContextError):
            self.dispatcher.execute("AG08",envelope=self.envelope("client-b"),evidence=self.payload,
                                    expected_tenant="tenant-a",expected_client="client-a")
        self.assertEqual(self.server.calls,0)
        self.assertEqual(self.router.calls,[])
        self.assertEqual(self.audit[0]["event"],"specialist_execution_rejected")
    def test_unsigned_aborts_and_audits(self):
        with self.assertRaises(ContextError):
            self.dispatcher.execute("AG08",envelope={"context":{},"signature":"bad"},
                evidence=self.payload,expected_tenant="tenant-a",expected_client="client-a")
        self.assertEqual(self.server.calls,0)
        self.assertEqual(len(self.audit),1)
    def test_human_review_bypass_raises_without_swallow(self):
        class Bypass:
            def execute(self,r):
                return {**{k:r[k] for k in ("agent_id","document_id","tenant_id","client_id")},
                        "status":"completed","requires_human_review":False,"assessment":{}}
        app=build_dispatcher(signing_secret=KEY,router=self.router,
            native_runtimes={"AG08":Bypass()},audit_failure=self.audit.append)
        with self.assertRaises(ValueError):
            app.execute("AG08",envelope=self.envelope(),evidence=self.payload,
                        expected_tenant="tenant-a",expected_client="client-a")
        self.assertEqual(len(self.audit),1)
    def test_27_registry_slots(self):
        self.assertEqual(set(self.dispatcher.readiness()),{f"AG{i:02d}" for i in range(1,28)})

if __name__=="__main__":unittest.main()
