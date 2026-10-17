import { getDefaultNexusEnvironment } from "@/lib/nexus/runtime-environment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const environment = getDefaultNexusEnvironment();
  return Response.json(
    {
      environment,
      selectionRequired: true,

    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
