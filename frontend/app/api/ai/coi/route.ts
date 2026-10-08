import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireWorkspaceModulePermission } from '@/lib/rbac/workspace-guard';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { NEXUS_MODULES } from '@/lib/nexus/modules';
import { routeErrorResponse } from '@/lib/api/route-error';
import { aiProviderFactory } from '@/lib/ai/provider-factory';
import { recordAIAudit } from '@/lib/ai/ai-audit';
import { runCOI } from '@/lib/ai/coi/coi-agent';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const Input=z.object({module:z.enum(['literature','intake','case_processing']),segments:z.array(z.object({id:z.string().min(1).max(100),text:z.string().min(1).max(6500),locator:z.string().min(1).max(300)}).strict()).min(1).max(8)}).strict();
export async function POST(request:NextRequest){
 try{
  if(Number(request.headers.get('content-length')||0)>250000)return Response.json({error:'Request too large'},{status:413});
  const raw=await request.text();if(raw.length>250000)return Response.json({error:'Request too large'},{status:413});
  const parsed=Input.safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:'Invalid document segments'},{status:422});
  const body=parsed.data;
  if(new Set(body.segments.map(s=>s.id)).size!==body.segments.length)return Response.json({error:'Duplicate segment IDs'},{status:422});
  const scopes={literature:[NEXUS_MODULES.LITERATURE,PERMISSIONS.REVIEW_EDIT],intake:[NEXUS_MODULES.INTAKE,PERMISSIONS.INTAKE_PROCESS],case_processing:[NEXUS_MODULES.CASE_PROCESSING,PERMISSIONS.CASE_PROCESS]} as const;
  const [module,permission]=scopes[body.module];
  const principal=await requireWorkspaceModulePermission(request,module,permission);
  const requestId=randomUUID();
  const result=await runCOI(body.segments,aiProviderFactory.getProvider(),requestId);
  await recordAIAudit({operation:'coi_extraction',status:'SUCCESS',tenantId:principal.tenantId,requestId,metadata:{actorId:principal.userId,sourceSha256:result.sourceSha256,agentVersion:result.agentVersion,decisionCount:result.decisions.length,automaticRelease:false,warnings:result.warnings}});
  return Response.json({success:true,data:result},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return routeErrorResponse(error);}
}
