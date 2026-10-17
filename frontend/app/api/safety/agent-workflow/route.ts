import { type NextRequest } from "next/server";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";
import { runDocumentAgentWorkflow } from "@/lib/safety/agent-workflow/agent-workflow-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const principal = await requireWorkspaceModulePermission(request,NEXUS_MODULES.CASE_PROCESSING,PERMISSIONS.CASE_CREATE);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({success:false,error:"Invalid workflow request."},{status:400});
    const data = body as Record<string, unknown>;
    if (Object.keys(data).some(k => !["intakeRecordId","requestId","reason"].includes(k)) ||
        [data.intakeRecordId,data.requestId,data.reason].some(v => typeof v !== "string" || !v.trim()))
      return Response.json({success:false,error:"Only source ID, request ID and reason are accepted."},{status:400});
    const result = await runDocumentAgentWorkflow({ principal,intakeRecordId:data.intakeRecordId as string,requestId:data.requestId as string,reason:data.reason as string });
    return Response.json({success:true,data:result},{headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
  } catch (error) { return routeErrorResponse(error); }
}
