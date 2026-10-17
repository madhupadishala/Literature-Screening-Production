import assert from 'node:assert/strict';
import { test,beforeEach } from 'node:test';
import { registerHooks,stripTypeScriptTypes } from 'node:module';
import { readFileSync,existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=new URL('../../',import.meta.url);
let queries=[],source,changed=false,executions=0;
const digest=createHash('sha256').update('Synthetic source only').digest('hex');
globalThis.__workflowPool={async query(sql,params){
  queries.push({sql,params});
  if(sql.includes('SELECT i.id,i.status'))return {rows:source?[source]:[]};
  if(sql.includes('SELECT source_sha256,result'))return {rows:[]};
  if(sql.includes('SELECT d.extracted_text_sha256'))return {rows:changed?[]:[{extracted_text_sha256:digest}]};
  return {rows:[]};
},async connect(){return {...this,release(){}}}};
registerHooks({resolve(s,c,next){
  if(s==='server-only')return {url:'data:text/javascript,export {}',shortCircuit:true};
  if(s==='@/lib/database/postgres')return {url:'data:text/javascript,export const getPostgresPool=()=>globalThis.__workflowPool',shortCircuit:true};
  if(s==='@/lib/safety/case-processing/case-processing-service')return {url:'data:text/javascript,export async function ensureInitialDraft(client,principal,caseId){await client.query("SYNTHETIC_DRAFT_CREATED",[principal.tenantId,principal.workspaceId,principal.environment,caseId])}',shortCircuit:true};
  if(s==='@/lib/safety/common/safety-case-service')return {url:'data:text/javascript,export async function createSafetyCaseShellInTransaction({client,principal,request}){await client.query("SYNTHETIC_CASE_CREATED",[principal.tenantId,principal.workspaceId,principal.environment,request.intakeRecordId]);return {caseId:"synthetic-case",caseStatus:"NEW"}}',shortCircuit:true};
  if(s.startsWith('@/'))return {url:new URL(s.slice(2)+'.ts',root).href,shortCircuit:true};
  if(s.startsWith('.')&&c.parentURL?.endsWith('.ts')){const u=new URL(s+'.ts',c.parentURL);if(existsSync(fileURLToPath(u)))return {url:u.href,shortCircuit:true};}
  return next(s,c);
},load(url,c,next){if(new URL(url).pathname.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(readFileSync(fileURLToPath(url),'utf8'),{mode:'transform'}),shortCircuit:true};return next(url,c);}});
const {runDocumentAgentWorkflow}=await import(new URL('lib/safety/agent-workflow/agent-workflow-service.ts',root));
const principal={tenantId:'tenant-uuid',tenantKey:'tenant-a',workspaceId:'workspace-a',environment:'UAT',userId:'reviewer'};
const input={principal,intakeRecordId:'intake-a',requestId:'synthetic-request',reason:'Synthetic controlled pipeline test'};
async function execute(r){executions++;return {...r,outcomes:Object.fromEntries(Array.from({length:27},(_,i)=>['AG'+String(i+1).padStart(2,'0'),{status:'review_required',assessment:{synthetic:true}}]))};}
beforeEach(()=>{queries=[];changed=false;executions=0;source={id:'intake-a',document_id:'doc-a',status:'READY_FOR_CASE',extracted_text:'Synthetic source only',source_sha256:digest,initial_receipt_date:'2026-10-01',latest_receipt_date:'2026-10-01',patients:[],reporters:[],products:[],events:[],language_code:'en'};});
test('approved source -> real transaction adapter -> draft review and non-transmissible preview',async()=>{
 const result=await runDocumentAgentWorkflow(input,execute);
 assert.equal(result.executedSlots,27);assert.equal(result.submissionPreview.transmissionEnabled,false);
 assert.equal(result.status,'PENDING_HUMAN_REVIEW');assert.equal(result.tenantKey,'tenant-a');
 assert.equal(queries.at(-1).sql,'COMMIT');
 assert.ok(queries.find(q=>q.sql.includes('AGENT_WORKFLOW_DRAFT_STAGED')));
 for(const q of queries.filter(q=>q.sql.includes('nexus_agent_workflow_runs')))assert.deepEqual(q.params.slice(0,3),['tenant-uuid','workspace-a','UAT']);
 assert.deepEqual(queries.find(q=>q.sql.includes('SELECT i.id,i.status')).params,['tenant-uuid','workspace-a','UAT','intake-a']);
});
test('foreign/missing workspace source is rejected before remote disclosure',async()=>{source=null;await assert.rejects(runDocumentAgentWorkflow(input,execute),/not found/);assert.equal(executions,0);});
test('source review cannot be silently promoted by agent results',async()=>{source.status='NEW';await assert.rejects(runDocumentAgentWorkflow(input,execute),/Source review/);assert.equal(executions,0);});
test('poisoned agent workspace cannot create a case',async()=>{await assert.rejects(runDocumentAgentWorkflow(input,async r=>({...await execute(r),workspaceId:'foreign'})),/scope\/source mismatch/);assert.ok(!queries.some(q=>q.sql==='BEGIN'));});
test('partial dispatch cannot stage a complete case',async()=>{await assert.rejects(runDocumentAgentWorkflow(input,async r=>({...r,outcomes:{}})),/Complete review-only/);assert.ok(!queries.some(q=>q.sql==='BEGIN'));});
test('source mutation during inference aborts and rolls back',async()=>{changed=true;await assert.rejects(runDocumentAgentWorkflow(input,execute),/Source changed/);assert.equal(queries.at(-1).sql,'ROLLBACK');assert.ok(!queries.some(q=>q.sql==='SYNTHETIC_CASE_CREATED'));});
