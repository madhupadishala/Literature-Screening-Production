import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * ClinixAI Nexus Platform - Evidence Download Routing Endpoint
 * 
 * Securely streams files from the localized multi-tenant evidence store to the client UI.
 * Hardened against directory traversal attacks and fully compliant with Next.js asynchronous route parameters.
 * Extracts the file target type via URL search query parameters (e.g., ?fileType=xml).
 */

// Define the shape of valid files allowed out of the screening module evidence container
const ALLOWED_FILE_TYPES: Record<string, { fileName: string; contentType: string }> = {
  xml: { fileName: "pubmed.xml", contentType: "application/xml" },
  json: { fileName: "metadata.json", contentType: "application/json" },
  txt: { fileName: "abstract.txt", contentType: "text/plain" },
  manifest: { fileName: "evidence_manifest.json", contentType: "application/json" },
  hash: { fileName: "hash.json", contentType: "application/json" },
};

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ packageId: string }> }
): Promise<Response> {
  try {
    // 1. Await the asynchronous path parameters promise required by Next.js
    const { packageId } = await props.params;

    // 2. Extract the fileType configuration out of the URL search query parameters
    const fileType = request.nextUrl.searchParams.get("fileType") || "manifest";

    // 3. Validate requested parameters defensively
    if (!packageId) {
      return NextResponse.json(
        { error: "Bad Request: Missing packageId configuration parameter." },
        { status: 400 }
      );
    }

    const fileMeta = ALLOWED_FILE_TYPES[fileType.toLowerCase()];
    if (!fileMeta) {
      return NextResponse.json(
        { error: `Forbidden: Unsupported or restricted file target type '${fileType}'.` },
        { status: 400 }
      );
    }

    // 4. Extract tenant context securely from the incoming package identifier
    // Expected incoming packageId signature format: "demo-tenant_PMID_12345678"
    const splitIndex = packageId.indexOf("_PMID_");
    let tenantId = "demo-tenant";
    let pmidValue = packageId;

    if (splitIndex !== -1) {
      tenantId = packageId.substring(0, splitIndex);
      pmidValue = packageId.substring(splitIndex + 1); // Isolates "PMID_12345678"
    } else {
      // Fallback matching logic pattern if structural prefix tags are missing
      pmidValue = packageId.startsWith("PMID_") ? packageId : `PMID_${packageId}`;
    }

    // 5. Resolve and isolate file target directory maps safely
    const projectRoot = process.cwd();
    const evidenceStoreRoot = path.resolve(projectRoot, "..", "evidence_store");
    const targetFilePath = path.join(evidenceStoreRoot, tenantId, pmidValue, fileMeta.fileName);

    // 6. Hardened Security Layer: Prevent Directory Traversal Injections
    if (!targetFilePath.startsWith(evidenceStoreRoot)) {
      return NextResponse.json(
        { error: "Security Violation: Illegal path traversal detected." },
        { status: 403 }
      );
    }

    // 7. Verify target file visibility on local storage systems
    if (!fs.existsSync(targetFilePath)) {
      return NextResponse.json(
        { error: `File Not Found: The requested component '${fileMeta.fileName}' does not exist for this package.` },
        { status: 404 }
      );
    }

    // 8. Initialize secure binary read stream blocks
    const fileBuffer = fs.readFileSync(targetFilePath);

    // 9. Dispatch finalized stream payload alongside standards-compliant browser response mapping headers
    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": fileMeta.contentType,
        "Content-Disposition": `attachment; filename="${packageId}_${fileMeta.fileName}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });

  } catch (error: unknown) {
    // Gracefully catch internal failures without exposing low-level system path specifications to client logs
    console.error("[Nexus Download API Exception]:", error);
    return NextResponse.json(
      { error: "Internal Server Error: Failed to safely process file transport stream." },
      { status: 500 }
    );
  }
}
