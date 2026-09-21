import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import {
  createSprint6CPositiveFixture,
  listSprint6CFixtures,
} from "@/lib/validation/sprint6c-fixture-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.SUPER_USER_CONSOLE_MANAGE,
    );
    const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 25);
    const fixtures = await listSprint6CFixtures({
      principal,
      limit: Number.isFinite(rawLimit) ? rawLimit : 25,
    });
    return Response.json({
      success: true,
      data: { fixtures, count: fixtures.length },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.SUPER_USER_CONSOLE_MANAGE,
    );
    const body = await request.json();
    const fixture = await createSprint6CPositiveFixture({
      principal,
      reason: String(body.reason || ""),
    });
    return Response.json({ success: true, data: { fixture } }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
