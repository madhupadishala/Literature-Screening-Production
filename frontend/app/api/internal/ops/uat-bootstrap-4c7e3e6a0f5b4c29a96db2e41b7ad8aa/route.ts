import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_GIT_BRANCH = "cleanup/zero-deviation-baseline-20260930";
const STATUS_FILE = path.join("/tmp", "uat-bootstrap-status.json");

function response(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function tail(value: string | null | undefined, maxLines = 40): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-maxLines)
    .map((line) => line.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]"));
}

export async function GET(): Promise<Response> {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== TARGET_GIT_BRANCH
  ) {
    return new Response("Not Found", { status: 404 });
  }

  const scriptPath = path.join(process.cwd(), "scripts", "bootstrap-preview-uat.mjs");
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 2 * 1024 * 1024,
  });

  let bootstrapStatus: Record<string, unknown> | null = null;
  try {
    bootstrapStatus = JSON.parse(await readFile(STATUS_FILE, "utf8")) as Record<string, unknown>;
  } catch {
    bootstrapStatus = null;
  }

  if (result.error) {
    return response(
      {
        ok: false,
        bootstrapStatus,
        error: result.error.message,
        stdout: tail(result.stdout),
        stderr: tail(result.stderr),
      },
      500,
    );
  }

  if (result.status !== 0) {
    return response(
      {
        ok: false,
        bootstrapStatus,
        exitStatus: result.status,
        stdout: tail(result.stdout),
        stderr: tail(result.stderr),
      },
      500,
    );
  }

  return response({
    ok: bootstrapStatus?.ready === true,
    bootstrapStatus,
    stdout: tail(result.stdout),
    stderr: tail(result.stderr),
  }, bootstrapStatus?.ready === true ? 200 : 409);
}
