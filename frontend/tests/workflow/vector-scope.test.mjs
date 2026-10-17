import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
globalThis.__vectorPrincipal=null;
registerHooks({resolve(s,c,next){
 if(s==='server-only')return {url:'data:text/javascript,export {}',shortCircuit:true};
 if(s==='next/server')return {url:new URL('node_modules/next/server.js',root).href,shortCircuit:true};
 if(s==='@/lib/rbac/request-principal')return {url:'data:text/javascript,export class AuthorizationError extends Error{constructor(m,statusCode){super(m);this.statusCode=statusCode}};export async function resolveRequestPrincipal(){if(!globalThis.__vectorPrincipal)throw new AuthorizationError("Authentication required",401);return globalThis.__vectorPrincipal}',shortCircuit:true};
 if(s==='@/lib/api/route-error')return {url:'data:text/javascript,export function routeErrorResponse(e){return Response.json({success:false},{status:e.statusCode??500})}',shortCircuit:true};
 if(s==='@/lib/safety/common/safety-workspace-scope')return {url:'data:text/javascript,export function requireSafetyWorkspaceScope(p){if(!p.workspaceId)throw new Error("workspace required");return {workspaceId:p.workspaceId,environment:p.environment}}',shortCircuit:true};
 if(s.startsWith('@/'))return {url:new URL(s.slice(2)+'.ts',root).href,shortCircuit:true};
 if(s.startsWith('.')&&c.parentURL?.endsWith('.ts')){const u=new URL(s+'.ts',c.parentURL);if(existsSync(fileURLToPath(u)))return {url:u.href,shortCircuit:true};}
 return next(s,c);
},load(u,c,next){if(new URL(u).pathname.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'}),shortCircuit:true};return next(u,c);}});
const route=await import(new URL('app/api/platform/ai/vector/route.ts',root));
const request=body=>new Request('http://localhost/api/platform/ai/vector',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const principal=(tenantId,workspaceId,environment='UAT',upload=true)=>({tenantId,workspaceId,environment,hasPermission:()=>upload});
test('legacy vector routes require a server-authenticated context',async()=>{globalThis.__vectorPrincipal=null;assert.equal((await route.POST(request({tenantId:'spoofed',queryVector:[1,0]}))).status,401)});
test('actual memory provider isolates tenant, workspace, environment before similarity and namespaced upsert IDs',async()=>{
 for(const [tenant,workspace,environment] of [['tenant-a','workspace-a','UAT'],['tenant-a','workspace-b','UAT'],['tenant-b','workspace-a','UAT'],['tenant-a','workspace-a','PROD']]){
  globalThis.__vectorPrincipal=principal(tenant,workspace,environment);
  const response=await route.POST(request({id:'same-client-chosen-id',vector:[1,0],createdAt:new Date().toISOString(),metadata:{tenantId:'spoofed',documentId:tenant+workspace+environment,chunkId:'chunk'}}));
  assert.equal(response.status,201);
 }
 for(const [tenant,workspace,environment] of [['tenant-a','workspace-a','UAT'],['tenant-a','workspace-b','UAT'],['tenant-b','workspace-a','UAT'],['tenant-a','workspace-a','PROD']]){
  globalThis.__vectorPrincipal=principal(tenant,workspace,environment);
  const response=await route.POST(request({tenantId:'spoofed',queryVector:[1,0],topK:10}));
  const payload=await response.json();assert.equal(payload.results.length,1);
  assert.equal(payload.results[0].metadata.documentId,tenant+workspace+environment);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
 }
});
test('viewer cannot write vectors',async()=>{globalThis.__vectorPrincipal=principal('tenant-a','workspace-a','UAT',false);assert.equal((await route.POST(request({id:'x',vector:[1,0],metadata:{documentId:'d',chunkId:'c'}}))).status,403)});
