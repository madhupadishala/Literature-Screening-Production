"""Local Unix-domain JSON RPC to an explicitly configured Node specialist bridge.

No public network, shell invocation, URL from input or automatic provider selection.
A separately supervised Node process must register actual TS engine handlers.
"""
import json
import os
import socket
import stat
import struct
from pathlib import Path

TS_AGENT_IDS=frozenset({"AG08","AG12","AG17","AG20","AG26"})
MAX_FRAME=524288

class NativeTransportError(RuntimeError): pass

class NodeSocketRuntime:
    def __init__(self, agent_id, *, socket_path, timeout=20):
        if agent_id not in TS_AGENT_IDS: raise ValueError("Unknown TypeScript specialist")
        path=Path(socket_path)
        if not path.is_absolute() or len(str(path))>100: raise ValueError("Absolute short socket path required")
        if not 0 < timeout <= 60: raise ValueError("Invalid transport timeout")
        self.agent_id,self.path,self.timeout=agent_id,str(path),timeout

    def execute(self, request):
        if request.get("agent_id")!=self.agent_id: raise PermissionError("Agent mismatch")
        raw=json.dumps(request,separators=(",",":"),allow_nan=False).encode()
        if len(raw)>MAX_FRAME: raise ValueError("Native request too large")
        try:
            with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as connection:
                connection.settimeout(self.timeout)
                connection.connect(self.path)
                connection.sendall(struct.pack("!I",len(raw))+raw)
                header=self._recv(connection,4)
                length=struct.unpack("!I",header)[0]
                if not 0 < length <= MAX_FRAME: raise NativeTransportError("Invalid response frame")
                answer=json.loads(self._recv(connection,length))
        except (OSError,TimeoutError,ValueError,UnicodeError) as exc:
            raise NativeTransportError("Native specialist unavailable") from None
        if not isinstance(answer,dict): raise NativeTransportError("Invalid native response")
        return answer

    @staticmethod
    def _recv(sock,count):
        parts=bytearray()
        while len(parts)<count:
            piece=sock.recv(count-len(parts))
            if not piece: raise NativeTransportError("Native IPC connection closed")
            parts.extend(piece)
        return bytes(parts)

def approved_native_engines(*, socket_path, ag02_runtime=None, configured_agents=()):
    """Register only explicit, server-owned Node engines and approved AG02."""
    if not set(configured_agents).issubset(TS_AGENT_IDS):
        raise ValueError("Invalid approved TS agent list")
    engines={agent:NodeSocketRuntime(agent,socket_path=socket_path) for agent in configured_agents}
    if ag02_runtime is not None: engines["AG02"]=ag02_runtime
    return engines
