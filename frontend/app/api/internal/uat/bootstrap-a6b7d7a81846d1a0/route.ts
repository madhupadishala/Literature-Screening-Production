import type { NextRequest } from "next/server";

import {
  getPreviewUatBootstrapStatus,
  runPreviewUatBootstrap,
} from "@/lib/nexus/preview-uat-bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(value: unknown): string {
  return String(value ?? "").replace(/[<>&"]/g, "");
}

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
body{font-family:Arial,sans-serif;background:#0b2740;color:#102a43;margin:0;padding:24px}
main{max-width:680px;margin:7vh auto;background:#fff;border-radius:20px;padding:28px;box-shadow:0 12px 40px rgba(0,0,0,.2)}
h1{margin:0 0 16px;font-size:28px}p{line-height:1.5}
code{display:block;padding:12px;border-radius:10px;background:#f3f6f9;font-size:15px;word-break:break-all;margin:8px 0}
button{width:100%;margin-top:18px;border:0;border-radius:12px;padding:14px 18px;background:#185a9d;color:#fff;font-weight:800;font-size:16px}
.note{font-size:13px;color:#5c6773}
.ok{color:#166534}.bad{color:#991b1b}
</style>
</head>
<body><main><h1>${esc(title)}</h1>${body}</main></body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function GET(): Promise<Response> {
  try {
    const status = await getPreviewUatBootstrapStatus();

    if (status.ready) {
      return page(
        "UAT database is ready",
        `<p class="ok"><strong>Migrations and UAT provisioning are complete.</strong></p>
         <code>database=${esc(status.database_name)}</code>
         <code>migrationCount=${status.migrationCount}</code>
         <code>maxMigration=${esc(status.maxMigration)}</code>
         <code>tenantCount=${status.tenantCount}</code>
         <code>adminCount=${status.adminCount}</code>
         <p class="note">You can now return to the login page and test the UAT administrator.</p>`,
      );
    }

    return page(
      "Initialize Wave 3 UAT database",
      `<p>This protected operation will apply the governed migration set through 039 and provision the fresh UAT tenant/workspace/admin chain.</p>
       <code>database=${esc(status.database_name)}</code>
       <code>migrationCount=${status.migrationCount}</code>
       <code>maxMigration=${esc(status.maxMigration)}</code>
       <code>tenantCount=${status.tenantCount}</code>
       <code>adminCount=${status.adminCount}</code>
       <form method="post">
         <input type="hidden" name="confirmation" value="INITIALIZE_WAVE3_UAT">
         <button type="submit">Initialize UAT</button>
       </form>
       <p class="note">The operation is restricted to the governed Preview branch and exact Neon project/branch guards.</p>`,
    );
  } catch (error) {
    return page(
      "UAT status check failed",
      `<p class="bad">No changes were made.</p><code>${esc(error instanceof Error ? error.message : "Unknown error")}</code>`,
      500,
    );
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const form = await request.formData();
    if (form.get("confirmation") !== "INITIALIZE_WAVE3_UAT") {
      return page(
        "UAT initialization rejected",
        '<p class="bad">Explicit initialization confirmation is required.</p>',
        400,
      );
    }

    const result = await runPreviewUatBootstrap();
    return page(
      "UAT initialization complete",
      `<p class="ok"><strong>The governed UAT database is ready.</strong></p>
       <code>migrationCount=${result.migrationCount}</code>
       <code>maxMigration=${esc(result.maxMigration)}</code>
       <code>tenantCount=${result.tenantCount}</code>
       <code>adminCount=${result.adminCount}</code>
       <p class="note">Return to the login page and use the temporary UAT administrator credentials.</p>`,
    );
  } catch (error) {
    return page(
      "UAT initialization failed",
      `<p class="bad">The provisioning transaction was rolled back where applicable.</p>
       <code>${esc(error instanceof Error ? error.message : "Unknown error")}</code>`,
      500,
    );
  }
}
