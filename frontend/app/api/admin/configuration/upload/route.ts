import { createHash } from "node:crypto";
import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import {
  createConfigurationVersion,
  recordConfigurationUpload,
  updateConfigurationUploadStatus,
} from "@/lib/configuration/repository";
import {
  CONFIGURATION_RESOURCE_TYPES,
  type ConfigurationResourceType,
} from "@/lib/configuration/types";
import { parseConfigurationFile } from "@/lib/configuration/parser";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resourceTypeFrom(value: FormDataEntryValue | null) {
  const normalized = String(value || "").trim().toUpperCase();
  if (
    !CONFIGURATION_RESOURCE_TYPES.includes(
      normalized as ConfigurationResourceType,
    )
  ) {
    throw new Error("A valid configuration resourceType is required.");
  }
  return normalized as ConfigurationResourceType;
}

export async function POST(request: NextRequest): Promise<Response> {
  let uploadId: string | null = null;
  let resourceType: ConfigurationResourceType | null = null;

  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.CONFIG_UPLOAD,
    );
    const form = await request.formData();
    resourceType = resourceTypeFrom(form.get("resourceType"));

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("A non-empty configuration file is required.");
    }

    const maximumBytes = Math.max(
      1_000_000,
      Math.min(
        Number(process.env.CONFIG_UPLOAD_MAX_BYTES || 25_000_000),
        100_000_000,
      ),
    );

    if (file.size > maximumBytes) {
      throw new Error(
        `Configuration file exceeds the maximum size of ${maximumBytes} bytes.`,
      );
    }

    const configKey = String(form.get("configKey") || "").trim();
    const displayName = String(form.get("displayName") || "").trim();
    const versionLabel = String(form.get("versionLabel") || "").trim();

    if (!configKey || !displayName || !versionLabel) {
      throw new Error(
        "configKey, displayName, and versionLabel are required.",
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const sourceStorageKey = `postgresql:configuration-payload/${principal.tenantKey}/${resourceType.toLowerCase()}/${sha256}`;

    uploadId = await recordConfigurationUpload({
      principal,
      resourceType,
      originalFilename: file.name,
      mediaType: file.type || "application/octet-stream",
      sizeBytes: buffer.length,
      sha256,
      storageKey: sourceStorageKey,
    });

    const payload = await parseConfigurationFile({
      resourceType,
      file,
    });

    await updateConfigurationUploadStatus({
      uploadId,
      status: "parsed",
    });

    const version = await createConfigurationVersion({
      principal,
      resourceType,
      configKey,
      displayName,
      description: String(form.get("description") || "").trim() || undefined,
      versionLabel,
      effectiveFrom:
        String(form.get("effectiveFrom") || "").trim() || null,
      effectiveTo:
        String(form.get("effectiveTo") || "").trim() || null,
      payload,
      changeReason:
        String(form.get("changeReason") || "").trim() ||
        "Configuration uploaded through tenant Admin Console.",
      upload: {
        uploadId,
        sourceFilename: file.name,
        sourceMediaType: file.type || "application/octet-stream",
        sourceStorageKey,
      },
    });

    await updateConfigurationUploadStatus({
      uploadId,
      status: "validated",
    });

    return Response.json(
      {
        success: true,
        data: version,
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadId) {
      await updateConfigurationUploadStatus({
        uploadId,
        status: "failed",
        failureCode: "CONFIGURATION_PARSE_FAILED",
        failureReason:
          error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
    }

    return routeErrorResponse(error);
  }
}
