import fs from "node:fs";
import path from "node:path";

type LabelManifest = {
  labelId: string;
  brandName: string;
  genericName: string;
  country: string;
  documentType: string;
  version: string;
  effectiveDate?: string | null;
  governanceStatus?: string;
  effectiveForProduction?: boolean;
  referenceMapping?: {
    clientProductId?: string;
    approvalStatus?: string;
    tenantClientAssignment?: string;
    productionUseBlocked?: boolean;
    historicalVersionMatch?: string;
  };
  source?: {
    path?: string;
    sha256?: string;
    mimeType?: string;
    authorityClass?: string;
  };
};

export interface LabelReferenceCandidate {
  labelKey: string;
  clientProductId: string;
  brandName: string;
  genericName: string;
  country: string;
  labelType: string;
  version: string;
  effectiveFrom?: string;
  eventTerms: string[];
  sourceDocument: string;
  usageScope: "VALIDATION_ONLY";
  manifestPath: string;
  sourceSha256: string;
  sourceMediaType: string;
  authorityClass: string;
  governanceStatus: string;
  approvalStatus: string;
  tenantClientAssignment: string;
  historicalVersionMatch: string;
  productionUseBlocked: boolean;
  blockers: string[];
}

function walkForManifestFiles(root: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walkForManifestFiles(full, out);
    else if (entry.isFile() && entry.name === "manifest.json") out.push(full);
  }
  return out;
}

function relativeKnowledgePath(absolutePath: string, knowledgeRoot: string): string {
  return path.posix.join(
    "knowledge",
    path.relative(knowledgeRoot, absolutePath).split(path.sep).join("/"),
  );
}

function blockersFor(manifest: LabelManifest): string[] {
  const blockers: string[] = [];

  if (manifest.governanceStatus !== "APPROVED" && manifest.governanceStatus !== "EFFECTIVE") {
    blockers.push("GOVERNANCE_NOT_APPROVED");
  }
  if (!manifest.effectiveDate) blockers.push("EFFECTIVE_DATE_MISSING");
  if (manifest.effectiveForProduction !== true) blockers.push("NOT_PRODUCTION_ELIGIBLE");
  if (manifest.referenceMapping?.productionUseBlocked !== false) {
    blockers.push("PRODUCTION_USE_BLOCKED");
  }
  if (
    !manifest.referenceMapping?.tenantClientAssignment ||
    manifest.referenceMapping.tenantClientAssignment === "UNASSIGNED_REFERENCE_ONLY"
  ) {
    blockers.push("TENANT_CLIENT_UNASSIGNED");
  }
  if (
    !manifest.referenceMapping?.approvalStatus ||
    manifest.referenceMapping.approvalStatus !== "APPROVED"
  ) {
    blockers.push("PRODUCT_REGULATORY_REVIEW_PENDING");
  }
  if (
    !manifest.referenceMapping?.historicalVersionMatch ||
    manifest.referenceMapping.historicalVersionMatch === "UNRESOLVED"
  ) {
    blockers.push("HISTORICAL_VERSION_UNRESOLVED");
  }

  return blockers;
}

export function listLabelReferenceCandidates(): LabelReferenceCandidate[] {
  const knowledgeRoot = process.env.CLINIXAI_KNOWLEDGE_ROOT?.trim()
    ? path.resolve(process.env.CLINIXAI_KNOWLEDGE_ROOT.trim())
    : path.resolve(process.cwd(), "..", "knowledge");
  const labelingRoot = path.join(knowledgeRoot, "Labeling");

  if (!fs.existsSync(labelingRoot)) return [];

  return walkForManifestFiles(labelingRoot)
    .sort()
    .map((manifestFile) => {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as LabelManifest;
      const clientProductId = String(manifest.referenceMapping?.clientProductId || "").trim();
      const sourceDocument = String(manifest.source?.path || "").trim();

      if (!manifest.labelId || !clientProductId || !manifest.country || !manifest.documentType) {
        throw new Error(
          `Incomplete label manifest cannot be mapped: ${relativeKnowledgePath(manifestFile, knowledgeRoot)}`,
        );
      }
      if (!sourceDocument) {
        throw new Error(`Label manifest has no source document: ${manifest.labelId}`);
      }

      return {
        labelKey: manifest.labelId,
        clientProductId,
        brandName: manifest.brandName,
        genericName: manifest.genericName,
        country: manifest.country,
        labelType: manifest.documentType,
        version: manifest.version,
        effectiveFrom: manifest.effectiveDate || undefined,
        eventTerms: [],
        sourceDocument,
        usageScope: "VALIDATION_ONLY" as const,
        manifestPath: relativeKnowledgePath(manifestFile, knowledgeRoot),
        sourceSha256: String(manifest.source?.sha256 || ""),
        sourceMediaType: String(manifest.source?.mimeType || ""),
        authorityClass: String(manifest.source?.authorityClass || ""),
        governanceStatus: String(manifest.governanceStatus || ""),
        approvalStatus: String(manifest.referenceMapping?.approvalStatus || ""),
        tenantClientAssignment: String(
          manifest.referenceMapping?.tenantClientAssignment || "",
        ),
        historicalVersionMatch: String(
          manifest.referenceMapping?.historicalVersionMatch || "",
        ),
        productionUseBlocked: manifest.referenceMapping?.productionUseBlocked !== false,
        blockers: blockersFor(manifest),
      };
    });
}

export function buildLabelReferenceCandidatePayload(): {
  usageScope: "VALIDATION_ONLY";
  records: Array<Record<string, unknown>>;
  candidateMetadata: {
    generatedFrom: string;
    candidateCount: number;
    productionReadyCount: number;
    blockedCount: number;
  };
} {
  const candidates = listLabelReferenceCandidates();

  return {
    usageScope: "VALIDATION_ONLY",
    records: candidates.map((candidate) => ({
      labelKey: candidate.labelKey,
      clientProductId: candidate.clientProductId,
      country: candidate.country,
      labelType: candidate.labelType,
      version: candidate.version,
      ...(candidate.effectiveFrom ? { effectiveFrom: candidate.effectiveFrom } : {}),
      eventTerms: candidate.eventTerms,
      sourceDocument: candidate.sourceDocument,
      usageScope: candidate.usageScope,
      manifestPath: candidate.manifestPath,
      sourceSha256: candidate.sourceSha256,
      sourceMediaType: candidate.sourceMediaType,
      brandName: candidate.brandName,
      genericName: candidate.genericName,
      authorityClass: candidate.authorityClass,
      blockers: candidate.blockers,
    })),
    candidateMetadata: {
      generatedFrom: "knowledge/Labeling/**/manifest.json",
      candidateCount: candidates.length,
      productionReadyCount: candidates.filter((candidate) => candidate.blockers.length === 0).length,
      blockedCount: candidates.filter((candidate) => candidate.blockers.length > 0).length,
    },
  };
}

export function assertNoProductionPromotionWithoutClearance(
  candidate: LabelReferenceCandidate,
): void {
  if (candidate.blockers.length > 0) {
    throw new Error(
      `Label ${candidate.labelKey} cannot be promoted to PRODUCTION: ${candidate.blockers.join(", ")}`,
    );
  }
}
