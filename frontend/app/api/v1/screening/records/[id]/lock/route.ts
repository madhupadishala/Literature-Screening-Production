import {type NextRequest} from "next/server";
import {NEXUS_MODULES} from "@/lib/nexus/modules";
import {PERMISSIONS} from "@/lib/rbac/permissions";
import {requireWorkspaceModulePermission} from "@/lib/rbac/workspace-guard";
import {routeErrorResponse} from "@/lib/api/route-error";
import {acquireRecordLock,renewRecordLock,releaseRecordLock,getRecordLockStatus,leaseResponse,type LeaseProof} from "@/lib/literature/assignment/lock-service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
async function principal(req:NextRequest,write:boolean){
 return requireWorkspaceModulePermission(req,NEXUS_MODULES.LITERATURE,write?PERMISSIONS.SCREENING_REVIEW:PERMISSIONS.SEARCH_HISTORY_VIEW);
}
async function proof(req:NextRequest):Promise<LeaseProof>{
 const b:unknown=await req.json().catch(()=>null);
 if(!b||typeof b!=="object"||Array.isArray(b))throw new Error("JSON lease proof required.");
 const v=b as Record<string,unknown>;
 return {lock_token:typeof v.lock_token==="string"?v.lock_token:"",fencing_token:typeof v.fencing_token==="string"?v.fencing_token:""};
}
function errorResponse(e:unknown){return leaseResponse(e)??routeErrorResponse(e);}
export async function GET(req:NextRequest,ctx:Context){try{const p=await principal(req,false);return Response.json({success:true,data:await getRecordLockStatus((await ctx.params).id,p)},{headers:{"Cache-Control":"no-store"}});}catch(e){return errorResponse(e);}}
export async function POST(req:NextRequest,ctx:Context){try{const p=await principal(req,true);return Response.json({success:true,data:await acquireRecordLock((await ctx.params).id,p,"SCREENING")},{headers:{"Cache-Control":"no-store"}});}catch(e){return errorResponse(e);}}
export async function PATCH(req:NextRequest,ctx:Context){try{const p=await principal(req,true);return Response.json({success:true,data:await renewRecordLock((await ctx.params).id,p,"SCREENING",await proof(req))},{headers:{"Cache-Control":"no-store"}});}catch(e){return errorResponse(e);}}
export async function DELETE(req:NextRequest,ctx:Context){try{const p=await principal(req,true);await releaseRecordLock((await ctx.params).id,p,"SCREENING",await proof(req));return Response.json({success:true,data:{released:true}});}catch(e){return errorResponse(e);}}
