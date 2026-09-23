import { NextResponse } from "next/server";

const REVIEW_BRANCH = "feat/nexus-horizontal-operations-shell";
const REVIEW_TENANT_KEY = "nexus-uat-rc1-a";
const REVIEW_EMAIL = "nexus.review@theclinixai.local";

function reviewAccessEnabled(): boolean {
  return (
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === REVIEW_BRANCH
  );
}

export async function POST() {
  // This route only bootstraps the browser-side review state. Server APIs do
  // not trust this response as authentication: request-principal independently
  // enables its controlled UAT principal only on this exact Vercel preview
  // branch and re-resolves that identity from PostgreSQL on every request.
  if (!reviewAccessEnabled()) {
    return NextResponse.json({ error: "Review access is not available." }, { status: 404 });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);

  return NextResponse.json(
    {
      authenticated: true,
      reviewMode: true,
      tenantKey: REVIEW_TENANT_KEY,
      roleKey: "CLINIXAI_SUPER_ADMIN",
      session: {
        id: `review_${now.getTime()}`,
        accessToken: "",
        expiresAt: expiresAt.toISOString(),
        user: {
          id: "controlled-preview-reviewer",
          email: REVIEW_EMAIL,
          name: "Nexus UAT Reviewer",
          tenantId: REVIEW_TENANT_KEY,
          role: "super_admin",
          permissions: ["*"],
        },
      },
    },
    { status: 201 },
  );
}
