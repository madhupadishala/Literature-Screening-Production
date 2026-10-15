import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listScopedCaseDocuments, uploadScopedCaseDocument } from "@/lib/storage/scoped-case-documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Params={params:Promise<{intakeId:string}>};
export async function GET(request:NextRequest,context:Params):Promise<Response> {
  try {
    const principal=await requireWorkspaceModulePermission(request,NEXUS_MODULES.INTAKE,PERMISSIONS.INTAKE_VIEW);
    const {intakeId}=await context.params;
    return Response.json({success:true,data:await listScopedCaseDocuments({principal,target:{intakeRecordId:intakeId}})});
  } catch(error) { return routeErrorResponse(error); }
}
export async function POST(request:NextRequest,context:Params):Promise<Response> {
  try {
    const principal=await requireWorkspaceModulePermission(request,NEXUS_MODULES.INTAKE,PERMISSIONS.INTAKE_PROCESS);
    const {intakeId}=await context.params;
    const body=await request.formData();
    const file=body.get("file");
    if (!(file instanceof File)) throw new Error("Multipart file is required");
    return Response.json({success:true,data:await uploadScopedCaseDocument({principal,file,target:{intakeRecordId:intakeId}})},{status:201});
  } catch(error) { return routeErrorResponse(error); }
}
