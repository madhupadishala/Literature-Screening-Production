import { NextRequest, NextResponse } from "next/server";
import { getPermissions, type ClinixRole } from "@/lib/rbac";

type LoginBody = {
  username: string;
  password: string;
  environment: "PROD" | "UAT" | "TRAINING";
  tenantId: string;
};

const TENANTS = [
  { tenantId: "demo-tenant", tenantName: "Demo Tenant" },
  { tenantId: "novartis-prod", tenantName: "Novartis Workspace" },
  { tenantId: "uat-tenant", tenantName: "UAT Workspace" },
  { tenantId: "training-tenant", tenantName: "Training Workspace" },
];

function resolveRole(username: string): ClinixRole {
  const user = username.toLowerCase();

  if (user.includes("admin")) return "Client Admin";
  if (user.includes("super")) return "Super User";
  if (user.includes("qc")) return "QC Reviewer";
  if (user.includes("audit") || user.includes("training")) {
    return "Read Only / Auditor / Training";
  }

  return "Super User";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LoginBody;

    if (!body.username || !body.password || !body.environment || !body.tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: "Username, password, environment and tenant are required.",
        },
        { status: 400 }
      );
    }

    const tenant = TENANTS.find((item) => item.tenantId === body.tenantId);

    if (!tenant) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid tenant selected.",
        },
        { status: 400 }
      );
    }

    const role = resolveRole(body.username);
    const now = new Date();

    return NextResponse.json({
      success: true,
      session: {
        sessionId: `SES-${Date.now()}`,
        organizationId: "ORG-DEMO",
        organizationName: "ClinixAI Demo Organization",
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        userId: `USR-${body.username.toUpperCase().replaceAll(" ", "-")}`,
        userName: body.username,
        role,
        environment: body.environment,
        permissions: getPermissions(role),
        loginTime: now.toISOString(),
        lastActivity: now.toISOString(),
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
        locked: false,
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Login failed.",
      },
      { status: 500 }
    );
  }
}