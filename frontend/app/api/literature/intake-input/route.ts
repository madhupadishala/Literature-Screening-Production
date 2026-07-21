import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { generateIntakeInput } from "@/lib/literature/intake-input/intake-input-service";
import type { GenerateIntakeInputRequest } from "@/lib/literature/intake-input/intake-input-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.INTAKE_INPUT_GENERATE);
    const body = (await request.json()) as GenerateIntakeInputRequest;
    const generated = await generateIntakeInput({ principal, request: body });
    return Response.json(
      { success: true, data: generated },
      { status: generated.reused ? 200 : 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
