import {type NextRequest} from "next/server";
import {routeErrorResponse} from "@/lib/api/route-error";
import {createPvDocument,listPvDocuments} from "@/lib/pv-documentation/pv-document-service";
import type {CreatePvDocumentRequest} from "@/lib/pv-documentation/pv-document-types";
import {NEXUS_MODULES} from "@/lib/nexus/modules"; import {PERMISSIONS} from "@/lib/rbac/permissions"; import {requireWorkspaceModulePermission} from "@/lib/rbac/workspace-guard";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:NextRequest){try{const principal=await requireWorkspaceModulePermission(request,NEXUS_MODULES.PV_DOCUMENTATION,PERMISSIONS.PV_DOCUMENT_VIEW);const limit=Number(request.nextUrl.searchParams.get("limit")||"100");return Response.json({success:true,data:{records:await listPvDocuments({principal,limit})}});}catch(error){return routeErrorResponse(error);}}
export async function POST(request:NextRequest){try{const principal=await requireWorkspaceModulePermission(request,NEXUS_MODULES.PV_DOCUMENTATION,PERMISSIONS.PV_DOCUMENT_CREATE);const body=await request.json().catch(()=>null);if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("Invalid PV document request body.");return Response.json({success:true,data:await createPvDocument({principal,request:body as CreatePvDocumentRequest})},{status:201});}catch(error){return routeErrorResponse(error);}}
