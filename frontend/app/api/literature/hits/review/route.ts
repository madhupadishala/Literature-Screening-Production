import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { saveHitsReview } from "@/lib/literature/hits/hits-review-repository";
import type { SaveHitsReviewInput } from "@/lib/literature/hits/hits-review-types";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(request, NEXUS_MODULES.LITERATURE, PERMISSIONS.HITS_SUBMIT);
    const review = (await request.json()) as SaveHitsReviewInput;
    const saved = await saveHitsReview({ principal, review });

    return Response.json({ success: true, data: saved });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
