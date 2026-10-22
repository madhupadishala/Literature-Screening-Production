import net from 'node:net';
import fs from 'node:fs';
const path=process.env.NEXUS_NATIVE_SOCKET_PATH||'/run/nexus-agents/agent.sock';
try {
 const st=fs.statSync(path);
 if(!st.isSocket() || (st.mode & 0o777)!==0o600) process.exit(1);
 const conn=net.connect(path);
 conn.setTimeout(2000,()=>conn.destroy());
 conn.on('connect',()=>{conn.destroy();process.exit(0)});
 conn.on('error',()=>process.exit(1));
} catch {process.exit(1)}
