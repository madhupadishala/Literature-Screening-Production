"""Host-local staging contract verification; no clinical dispatch or live patient data."""
import os
from pathlib import Path
from Agentic_AI.shared.execution.node_socket_runtime import probe_native_ready, NativeTransportError

def secret(name):
    file=os.environ[name+'_FILE']
    return Path(file).read_text().strip()
def main():
    if os.environ.get('NEXUS_PV_AGENTS_ENABLED')!='false':
        raise SystemExit('Clinical autonomous dispatch must remain disabled')
    signing=secret('IPC_SIGNING_SECRET').encode()
    socket=os.environ.get('NEXUS_NATIVE_SOCKET_PATH','/run/nexus-agents/agent.sock')
    if not probe_native_ready(socket_path=socket,signing_secret=signing):
        raise SystemExit('Native signed readiness rejected')
    print('PHASE_A_PASS signed native readiness; clinical dispatch disabled')
    print('PHASE_B_NOT_RUN actual six-engine synthetic hosted execution requires provider fixtures')
    print('PHASE_C_NOT_RUN durable audit verification requires approved audit writer and read-only auditor')
if __name__=='__main__':
    main()
