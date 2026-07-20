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
import {
  quarantineConfigurationUpload,
  storeConfigurationUpload,
} from "@/lib/configuration/storage";
import { parseConfigurationUpload } from "@/lib/configuration/parser";
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
  let stored:
    | Awaited<ReturnType<typeof storeConfigurationUpload>>
    | null = null;
  let resourceType: ConfigurationResourceType | null = null;
  let tenantKey = "";

  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.CONFIG_UPLOAD,
    );
    tenantKey = principal.tenantKey;

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

    stored = await storeConfigurationUpload({
      tenantKey,
      resourceType,
      file,
    });

    uploadId = await recordConfigurationUpload({
      principal,
      resourceType,
      originalFilename: stored.originalFilename,
      mediaType: stored.mediaType,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      storageKey: stored.storageKey,
    });

    const payload = await parseConfigurationUpload({
      resourceType,
      absolutePath: stored.absolutePath,
      originalFilename: stored.originalFilename,
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
        sourceFilename: stored.originalFilename,
        sourceMediaType: stored.mediaType,
        sourceStorageKey: stored.storageKey,
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
        status: stored && resourceType ? "quarantined" : "failed",
        failureCode: "CONFIGURATION_PARSE_FAILED",
        failureReason:
          error instanceof Error ? error.message : String(error),
        storageKey:
          stored && resourceType
            ? await quarantineConfigurationUpload({
                tenantKey,
                resourceType,
                stored,
              }).catch(() => stored?.storageKey)
            : undefined,
      }).catch(() => undefined);
    }

    return routeErrorResponse(error);
  }
}
