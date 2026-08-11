import "server-only";

import ExcelJS from "exceljs";
import { getPostgresPool } from "@/lib/database/postgres";

// Every field here corresponds to real, populated data as of today. This
// is deliberately NOT the full Argus-style field list discussed (no
// causality, listedness, reporter, gender, DOB, narrative) -- those
// aren't extracted by the current screening logic, which produces a
// decision + rule-based findings, not full ICSR case fields. Offering a
// column with nothing behind it would be a worse experience than not
// offering it; extending extraction to populate those is a separate,
// later decision.
export const REPORT_FIELDS = [
  { id: "pmid", label: "PMID", category: "Identity" },
  { id: "doi", label: "DOI", category: "Identity" },
  { id: "title", label: "Title", category: "Identity" },
  { id: "journal", label: "Journal", category: "Identity" },
  { id: "authors", label: "Authors", category: "Identity" },
  { id: "publicationDate", label: "Publication Date", category: "Identity" },
  { id: "sourceDatabase", label: "Source Database", category: "Identity" },
  { id: "packageStatus", label: "Package Status", category: "Workflow" },
  { id: "screeningDecision", label: "Screening Decision", category: "Screening" },
  { id: "screeningConfidence", label: "Screening Confidence", category: "Screening" },
  { id: "screeningReason", label: "Screening Reason", category: "Screening" },
  { id: "duplicateStatus", label: "Duplicate Status", category: "Duplicate" },
  { id: "duplicateMatchType", label: "Duplicate Match Type", category: "Duplicate" },
  { id: "duplicateConfidence", label: "Duplicate Confidence", category: "Duplicate" },
  { id: "processedAt", label: "Processed At", category: "Workflow" },
] as const;

export type ReportFieldId = (typeof REPORT_FIELDS)[number]["id"];

export interface ReportFilters {
  tenantId: string; // real UUID, from the verified principal -- never client-supplied
  dateFrom?: string;
  dateTo?: string;
  decisions?: string[]; // INCLUDE / EXCLUDE / REVIEW
  titleContains?: string; // closest available proxy for "product" filtering
  // until product_context is populated by the workflow (tracked
  // separately -- see workflow-persistence-service.ts comments)
  fields: ReportFieldId[];
}

interface ReportRow {
  pmid: string;
  doi: string | null;
  title: string;
  journal: string | null;
  authors: string;
  publicationDate: string | null;
  sourceDatabase: string;
  packageStatus: string;
  screeningDecision: string | null;
  screeningConfidence: number | null;
  screeningReason: string | null;
  duplicateStatus: string;
  duplicateMatchType: string;
  duplicateConfidence: number | null;
  processedAt: string;
}

async function queryReportRows(filters: ReportFilters): Promise<ReportRow[]> {
  const pool = getPostgresPool();

  const conditions: string[] = ["lp.tenant_id = $1"];
  const params: unknown[] = [filters.tenantId];

  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    conditions.push(`lp.created_at >= $${params.length}`);
  }

  if (filters.dateTo) {
    params.push(filters.dateTo);
    conditions.push(`lp.created_at <= $${params.length}`);
  }

  if (filters.decisions && filters.decisions.length > 0) {
    params.push(filters.decisions);
    conditions.push(`sr.decision = ANY($${params.length}::text[])`);
  }

  if (filters.titleContains) {
    params.push(`%${filters.titleContains}%`);
    conditions.push(`lp.article_identity->>'title' ILIKE $${params.length}`);
  }

  const result = await pool.query(
    `
      SELECT
        lp.article_identity->>'pmid' AS pmid,
        lp.article_identity->>'doi' AS doi,
        lp.article_identity->>'title' AS title,
        hr.result_payload->'fetchResult'->'metadata'->>'journal' AS journal,
        hr.result_payload->'fetchResult'->'metadata'->'authors' AS authors,
        hr.result_payload->'fetchResult'->'metadata'->>'publicationDate' AS publication_date,
        COALESCE(hr.result_payload->'searchResult'->>'source', 'PubMed') AS source_database,
        lp.status AS package_status,
        sr.decision AS screening_decision,
        sr.confidence AS screening_confidence,
        sr.result_payload->>'reason' AS screening_reason,
        COALESCE((hr.result_payload->'duplicateResult'->>'isDuplicate')::boolean, false) AS is_duplicate,
        hr.result_payload->'duplicateResult'->'matches'->0->>'matchType' AS duplicate_match_type,
        (hr.result_payload->'duplicateResult'->>'confidence')::numeric AS duplicate_confidence,
        lp.created_at AS processed_at
      FROM literature_packages lp
      LEFT JOIN hits_results hr ON hr.package_id = lp.id AND hr.result_version = 1
      LEFT JOIN screening_results sr ON sr.package_id = lp.id AND sr.result_version = 1
      WHERE ${conditions.join(" AND ")}
      ORDER BY lp.created_at DESC
      LIMIT 5000
    `,
    params,
  );

  return result.rows.map((row) => ({
    pmid: row.pmid ?? "",
    doi: row.doi,
    title: row.title ?? "",
    journal: row.journal,
    authors: Array.isArray(row.authors) ? row.authors.join("; ") : "",
    publicationDate: row.publication_date,
    sourceDatabase: row.source_database ?? "PubMed",
    packageStatus: row.package_status ?? "",
    screeningDecision: row.screening_decision,
    screeningConfidence:
      row.screening_confidence !== null ? Number(row.screening_confidence) * 100 : null,
    screeningReason: row.screening_reason,
    duplicateStatus: row.is_duplicate ? "Duplicate" : "Non-duplicate",
    duplicateMatchType: row.duplicate_match_type ?? "",
    duplicateConfidence:
      row.duplicate_confidence !== null ? Number(row.duplicate_confidence) * 100 : null,
    processedAt: row.processed_at instanceof Date ? row.processed_at.toISOString() : String(row.processed_at),
  }));
}

export async function generateHitsScreeningReport(filters: ReportFilters): Promise<Buffer> {
  const rows = await queryReportRows(filters);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ClinixAI Literature Intelligence";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Line Listing");

  const fieldCatalog = new Map(REPORT_FIELDS.map((field) => [field.id, field]));
  const selectedFields = filters.fields.filter((id) => fieldCatalog.has(id));

  sheet.columns = selectedFields.map((id) => ({
    header: fieldCatalog.get(id)!.label,
    key: id,
    width: id === "title" || id === "screeningReason" ? 50 : 20,
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5E9F0" },
  };

  for (const row of rows) {
    sheet.addRow(row);
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: selectedFields.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
