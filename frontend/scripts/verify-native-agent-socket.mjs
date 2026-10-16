import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {createNativeBridge} from '../lib/server/native-agent-uds-bridge.mjs';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-native-'));
const socketPath=path.join(temp,'native.sock');
const ids=['AG08','AG12','AG17','AG20','AG26'];
const signingSecret='private-synthetic-ipc-signing-key-32-bytes';
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
const handlers=Object.fromEntries(ids.map(id=>[id,async r=>({
  agent_id:id,tenant_id:r.tenant_id,client_id:r.client_id,
  document_id:r.document_id,status:'review_required',
  requires_human_review:true,assessment:{synthetic:true,engine:id}
})]));
const bridge=createNativeBridge({socketPath,handlers,signingSecret});
function exchange(request,{tamper=false}={}) {
 const signed=createHmac('sha256',signingSecret).update(canonical(request)).digest('hex');
 request={...request,ipc_signature:signed};
 if(tamper)request.client_id='forged-client';
 return new Promise((resolve,reject)=>{
   const conn=net.createConnection(socketPath);
   let chunks=[];let done=false;
   conn.setTimeout(3000,()=>conn.destroy(new Error('timeout')));
   conn.on('connect',()=>{
     const body=Buffer.from(JSON.stringify(request));
     const h=Buffer.alloc(4);h.writeUInt32BE(body.length);
     conn.write(Buffer.concat([h,body]));
   });
   conn.on('data',data=>chunks.push(data));
   conn.on('error',error=>{if(!done){done=true;reject(error);}});
   conn.on('close',()=>{
     if(done)return;done=true;
     const payload=Buffer.concat(chunks);
     if(payload.length<4){reject(new Error('fail closed'));return;}
     const size=payload.readUInt32BE(0);
     if(size!==payload.length-4){reject(new Error('invalid frame'));return;}
     resolve(JSON.parse(payload.subarray(4).toString()));
   });
 });
}
try {
 await bridge.start();
 for(const id of ids) {
   const input=id==='AG08'?'Synthetic source event in France':
     {document_id:'SYN-1',source:{synthetic:true,products:[],patients:[],reporters:[],events:[]}};
   const out=await exchange({agent_id:id,tenant_id:'tenant-x',client_id:'client-y',
     document_id:'SYN-1',input,knowledge_citations:[]});
   assert.equal(out.agent_id,id);assert.equal(out.requires_human_review,true);
   assert.equal(out.status,'review_required');
   assert.equal(out.tenant_id,'tenant-x');assert.equal(out.client_id,'client-y');
 }
 await assert.rejects(exchange({agent_id:'AG26',tenant_id:'tenant-x',client_id:'client-y',
   document_id:'SYN-1',input:{document_id:'SYN-2',source:{}},knowledge_citations:[]}));
 await assert.rejects(exchange({agent_id:'AG26',tenant_id:'tenant-x',client_id:'client-y',
   document_id:'SYN-1',input:{document_id:'SYN-1',source:{}},knowledge_citations:[]},{tamper:true}));
 await bridge.close();
 assert.equal(fs.existsSync(socketPath),false);
 console.log('PASS: 5 native RPC routes, review-only outputs, tampered document fail-closed, socket cleanup');
} finally {
 try{await bridge.close();}catch{}
 fs.rmSync(temp,{recursive:true,force:true});
}
