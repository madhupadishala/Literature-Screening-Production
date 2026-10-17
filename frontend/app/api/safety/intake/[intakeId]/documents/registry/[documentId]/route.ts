import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { readScopedCaseDocument, archiveScopedCaseDocument } from "@/lib/storage/scoped-case-documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Params={params:Promise<{intakeId:string;documentId:string}>};
export async function GET(request:NextRequest,context:Params):Promise<Response> {
 try {
  const principal=await requireWorkspaceModulePermission(request,NEXUS_MODULES.INTAKE,PERMISSIONS.INTAKE_VIEW);
  const {intakeId,documentId}=await context.params;
  const file=await readScopedCaseDocument({principal,intakeRecordId:intakeId,documentId});
  return new Response(new Uint8Array(file.data), {
   status:200,
   headers:{"content-type":file.contentType,"content-disposition":"attachment; filename=\"icsr-document\"","cache-control":"private, no-store","x-content-type-options":"nosniff"}
  });
 } catch(error){return routeErrorResponse(error);}
}
export async function PATCH(request:NextRequest,context:Params):Promise<Response> {
 try {
  const principal=await requireWorkspaceModulePermission(request,NEXUS_MODULES.INTAKE,PERMISSIONS.INTAKE_PROCESS);
  const {intakeId,documentId}=await context.params;
  return Response.json({success:true,data:await archiveScopedCaseDocument({principal,intakeRecordId:intakeId,documentId})});
 } catch(error){return routeErrorResponse(error);}
}
