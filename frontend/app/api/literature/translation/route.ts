import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { medicalTranslationService } from "@/lib/literature/translation/medical-translation-service";
import { type MedicalTranslationRequest, type SupportedLanguage } from "@/lib/literature/translation/translation-types";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { assertRequestedTenantMatchesScope } from "@/lib/rbac/scoped-request";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.LITERATURE,
      PERMISSIONS.REVIEW_VIEW,
    );

    return Response.json({
      status: medicalTranslationService.getStatusForTenant(principal.tenantId),
      translations: medicalTranslationService.listForTenant(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.LITERATURE,
      PERMISSIONS.REVIEW_EDIT,
    );
    const parsed: unknown = await request.json().catch(() => null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json(
        { error: "A JSON object body is required." },
        { status: 400 },
      );
    }
    const body = parsed as Partial<MedicalTranslationRequest>;

    assertRequestedTenantMatchesScope(principal, body.tenantId);

    const sourceText =
      typeof body.sourceText === "string" ? body.sourceText.trim() : "";
    const supportedLanguages: readonly SupportedLanguage[] = [
      "en",
      "ja",
      "ko",
      "zh",
      "es",
      "pt",
      "fr",
      "de",
      "ru",
      "unknown",
    ];
    const isSupportedLanguage = (value: unknown): value is SupportedLanguage =>
      typeof value === "string" &&
      supportedLanguages.includes(value as SupportedLanguage);
    if (
      !sourceText ||
      (body.sourceLanguage !== undefined &&
        !isSupportedLanguage(body.sourceLanguage)) ||
      (body.targetLanguage !== undefined &&
        !isSupportedLanguage(body.targetLanguage)) ||
      (body.preserveTerms !== undefined &&
        (!Array.isArray(body.preserveTerms) ||
          body.preserveTerms.some((term) => typeof term !== "string")))
    ) {
      return Response.json(
        { error: "Invalid translation request." },
        { status: 400 },
      );
    }

    const result = medicalTranslationService.translate({
      tenantId: principal.tenantId,
      sourceText,
      ...(body.sourceLanguage !== undefined
        ? { sourceLanguage: body.sourceLanguage }
        : {}),
      ...(body.targetLanguage !== undefined
        ? { targetLanguage: body.targetLanguage }
        : {}),
      ...(body.preserveTerms !== undefined
        ? { preserveTerms: body.preserveTerms.map((term) => term.trim()).filter(Boolean) }
        : {}),
    });

    return Response.json({ result }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
