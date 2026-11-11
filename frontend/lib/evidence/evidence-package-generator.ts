import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RAGMergedContext } from "@/lib/rag/rag-types";
import type { ReviewRecord } from "@/lib/review/review-types";

import type {
  EvidenceAIRuntime,
  EvidenceArticleInformation,
  EvidencePackage,
  EvidencePackageStatus,
} from "./evidence-types";

function simpleHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function createPackageId(tenantId: string, articleId?: string): string {
  return [tenantId, articleId ?? "article", Date.now()].join("-");
}

interface WorkflowPackageRow {
  package_id: string;
  package_key: string;
  article_identity: Record<string, unknown>;
  product_context: Record<string, unknown>;
  workflow_state: string;
  status: string;
  hits_payload: Record<string, unknown> | null;
  screening_decision: string | null;
  screening_payload: Record<string, unknown> | null;
  screening_confidence: number | null;
}

interface EvidencePackageInput {
  tenantId: string;
  workspaceId: string;
  environment: "PROD" | "UAT" | "TRAINING";
  packageId: string;
  generatedBy?: string;
}

export class EvidencePackageGenerator {
  async build(input: EvidencePackageInput): Promise<EvidencePackage | null> {
    const pool = getPostgresPool();

    const result = await pool.query<WorkflowPackageRow>(
      `SELECT
         lp.id as package_id,
         lp.package_key,
         lp.article_identity,
         lp.product_context,
         lws.workflow_state,
         lp.status,
         hr.result_payload as hits_payload,
         sr.decision as screening_decision,
         sr.result_payload as screening_payload,
         sr.confidence as screening_confidence
       FROM literature_packages lp
       LEFT JOIN literature_workflow_state lws ON lws.package_id = lp.id
       LEFT JOIN LATERAL (
         SELECT result_payload FROM hits_results
         WHERE tenant_id = lp.tenant_id AND package_id = lp.id
         ORDER BY result_version DESC LIMIT 1
       ) hr ON true
       LEFT JOIN LATERAL (
         SELECT decision, result_payload, confidence FROM screening_results
         WHERE tenant_id = lp.tenant_id AND package_id = lp.id
         ORDER BY result_version DESC LIMIT 1
       ) sr ON true
       WHERE lp.id = $1`,
      [input.packageId],
    );

    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0];
    const articleIdentity = row.article_identity as Record<string, unknown> || {};
    const productContext = row.product_context as Record<string, unknown> || {};
    const hitsPayload = row.hits_payload as Record<string, unknown> | null;
    const screeningPayload = row.screening_payload as Record<string, unknown> | null;

    const article: EvidenceArticleInformation = {
      title: String(articleIdentity.title || ""),
      abstract: String(articleIdentity.abstract || ""),
      journal: String(articleIdentity.journal || ""),
      pmid: String(articleIdentity.pmid || row.package_key),
      doi: articleIdentity.doi ? String(articleIdentity.doi) : undefined,
      publicationDate: articleIdentity.publicationDate ? String(articleIdentity.publicationDate) : undefined,
      authors: Array.isArray(articleIdentity.authors) ? articleIdentity.authors.map(String) : [],
      country: String(articleIdentity.country || productContext.countryOfInterest || ""),
      hasFullText: Boolean(articleIdentity.fullTextAvailable),
    };

    const packageId = createPackageId(input.tenantId, article.pmid);
    const packageHash = simpleHash(JSON.stringify({
      article,
      hits: hitsPayload,
      screening: screeningPayload,
      workflowState: row.workflow_state,
    }));

    const status: EvidencePackageStatus = row.workflow_state === "INTAKE_INPUT_CREATED" ? "approved" :
      row.workflow_state.startsWith("SCREENING") ? "reviewed" : "draft";

    const aiExec = screeningPayload?.aiExecution as Record<string, unknown> | null;
    const aiExecution: EvidenceAIRuntime = {
      agentName: "Literature Workflow Engine",
      agentVersion: "1.0.0",
      modelName: (aiExec?.model as string) || "N/A",
      modelVersion: (aiExec?.modelVersion as string) || "N/A",
      promptVersion: (aiExec?.promptVersion as string) || "N/A",
      confidence: row.screening_confidence || 0,
      executedAt: new Date().toISOString(),
    };

    const evidencePackage: EvidencePackage = {
      metadata: {
        packageId,
        tenantId: input.tenantId,
        articleId: article.pmid,
        packageVersion: 1,
        packageHash,
        createdAt: new Date().toISOString(),
        generatedBy: input.generatedBy ?? "ClinixAI Literature Workflow Engine",
        status,
      },
      article,
      ragContext: {
        tenantId: input.tenantId,
        query: `PMID:${article.pmid}`,
        summary: `Literature workflow evidence package for ${article.pmid}`,
        chunks: [],
        contextPackId: `workflow-${row.package_key}`,
        citations: [],
        sourceBreakdown: {},
        warnings: [],
        generatedAt: new Date().toISOString(),
      },
      aiExecution,
      aiResult: {
        hits: hitsPayload,
        screening: screeningPayload,
        workflowState: row.workflow_state,
        packageStatus: row.status,
      },
      auditReferences: [],
      notes: [],
    };

    return evidencePackage;
  }

  async listForTenant(
    tenantId: string,
    workspaceId: string,
    environment: "PROD" | "UAT" | "TRAINING",
    limit = 20,
  ): Promise<EvidencePackage[]> {
    const pool = getPostgresPool();

    const tenantResult = await pool.query<{ id: string }>(
      "SELECT id FROM tenants WHERE tenant_key = $1 LIMIT 1",
      [tenantId],
    );
    const tenantUuid = tenantResult.rows[0]?.id;
    if (!tenantUuid) return [];

    const result = await pool.query<WorkflowPackageRow>(
      `SELECT
         lp.id as package_id,
         lp.package_key,
         lp.article_identity,
         lp.product_context,
         lws.workflow_state,
         lp.status,
         hr.result_payload as hits_payload,
         sr.decision as screening_decision,
         sr.result_payload as screening_payload,
         sr.confidence as screening_confidence
       FROM literature_packages lp
       LEFT JOIN literature_workflow_state lws ON lws.package_id = lp.id
       LEFT JOIN LATERAL (
         SELECT result_payload FROM hits_results
         WHERE tenant_id = lp.tenant_id AND package_id = lp.id
         ORDER BY result_version DESC LIMIT 1
       ) hr ON true
       LEFT JOIN LATERAL (
         SELECT decision, result_payload, confidence FROM screening_results
         WHERE tenant_id = lp.tenant_id AND package_id = lp.id
         ORDER BY result_version DESC LIMIT 1
       ) sr ON true
       WHERE lp.tenant_id = $1
         AND lp.workspace_id = $2
         AND lp.environment = $3
       ORDER BY lp.updated_at DESC
       LIMIT $4`,
      [tenantUuid, workspaceId, environment, limit],
    );

    const packages: EvidencePackage[] = [];
    for (const row of result.rows) {
      const pkg = await this.build({
        tenantId,
        workspaceId,
        environment,
        packageId: row.package_id,
      });
      if (pkg) packages.push(pkg);
    }
    return packages;
  }
}

export const evidencePackageGenerator = new EvidencePackageGenerator();