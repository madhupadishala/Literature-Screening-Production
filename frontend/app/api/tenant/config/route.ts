import { NextRequest, NextResponse } from "next/server";

import {
  deleteTenant,
  getTenantById,
  getTenantConfigSnapshot,
  setActiveTenant,
  upsertTenant,
} from "@/lib/tenant/tenant-store";

import type { TenantConfigUpdateRequest } from "@/lib/tenant/tenant-types";

/**
 * ------------------------------------------------------------------
 * GET
 * ------------------------------------------------------------------
 * Returns:
 * - All configured tenants
 * - Currently active tenant
 * */
export async function GET() {
  return NextResponse.json(getTenantConfigSnapshot());
}

/**
 * ------------------------------------------------------------------
 * POST
 * ------------------------------------------------------------------
 * Creates a new tenant or updates an existing tenant.
 *
 * Body:
 * {
 *   tenant: TenantConfiguration
 * }
 * */
export async function POST(request: NextRequest) {
  try {
    const body =
      (await request.json()) as Partial<TenantConfigUpdateRequest>;

    if (!body.tenant) {
      return NextResponse.json(
        {
          success: false,
          message: "Tenant payload is required.",
        },
        { status: 400 }
      );
    }

    const tenant = upsertTenant(body.tenant);

    return NextResponse.json({
      success: true,
      tenant,
    });
  } catch (error) {
    console.error("Tenant save failed", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to save tenant configuration.",
      },
      { status: 500 }
    );
  }
}

/**
 * ------------------------------------------------------------------
 * PUT
 * ------------------------------------------------------------------
 * Switch active tenant.
 *
 * Body:
 * {
 *    tenantId: string
 * }
 * */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      tenantId?: string;
    };

    if (!body.tenantId) {
      return NextResponse.json(
        {
          success: false,
          message: "tenantId is required.",
        },
        { status: 400 }
      );
    }

    const tenant = setActiveTenant(body.tenantId);

    if (!tenant) {
      return NextResponse.json(
        {
          success: false,
          message: "Tenant not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      activeTenant: tenant,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to switch tenant.",
      },
      { status: 500 }
    );
  }
}

/**
 * ------------------------------------------------------------------
 * DELETE
 * ------------------------------------------------------------------
 * Deletes tenant.
 *
 * Body:
 * {
 *    tenantId: string
 * }
 * */
export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      tenantId?: string;
    };

    if (!body.tenantId) {
      return NextResponse.json(
        {
          success: false,
          message: "tenantId is required.",
        },
        { status: 400 }
      );
    }

    const tenant = getTenantById(body.tenantId);

    if (!tenant) {
      return NextResponse.json(
        {
          success: false,
          message: "Tenant not found.",
        },
        { status: 404 }
      );
    }

    const deleted = deleteTenant(body.tenantId);

    return NextResponse.json({
      success: deleted,
      deletedTenantId: body.tenantId,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to delete tenant.",
      },
      { status: 500 }
    );
  }
}
