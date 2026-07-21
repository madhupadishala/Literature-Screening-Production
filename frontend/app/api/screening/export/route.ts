import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const projectRoot = path.resolve(process.cwd(), "..");
  const evidenceRoot = path.join(projectRoot, "evidence_store", "demo-tenant");

  const rows: Array<Record<string, unknown>> = [];

  if (fs.existsSync(evidenceRoot)) {
    const folders = fs
      .readdirSync(evidenceRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory());

    for (const folder of folders) {
      const packageDir = path.join(evidenceRoot, folder.name);
      const screeningPath = path.join(packageDir, "screening_output.json");
      const hitsPath = path.join(packageDir, "hits_output.json");

      if (!fs.existsSync(screeningPath)) continue;

      const screeningPayload = JSON.parse(fs.readFileSync(screeningPath, "utf8"));
      const hitsPayload = fs.existsSync(hitsPath)
        ? JSON.parse(fs.readFileSync(hitsPath, "utf8"))
        : { hits: [] };

      const hit = hitsPayload.hits?.[0] ?? {};

      for (const row of screeningPayload.screening ?? []) {
        rows.push({
          pmid: row.pmid,
          title: hit.title,
          product: hit.product_name || row.company_suspect_drugs?.[0],
          country: hit.country_of_interest,
          author: hit.primary_author,
          confidence: hit.confidence_score,
          company_suspect_drugs: row.company_suspect_drugs,
          active_mah: row.active_mah,
          co_suspect_drugs: row.co_suspect_drugs,
          concomitant_medications: row.concomitant_medications,
          treatment_medications: row.treatment_medications,
          clinical_events: row.clinical_events,
          special_situations: row.special_situations,
          event_severity: row.event_severity,
          seriousness: row.seriousness,
          patient_safety: row.patient_safety,
          patient_identification_pii: row.patient_identification_pii,
          coi: row.coi,
          screening_decision: row.screening_decision,
          flags: row.flags,
          generated_at: row.generated_at,
        });
      }
    }
  }

  const headers = [
    "PMID",
    "Title",
    "Product",
    "Country",
    "Author",
    "Confidence",
    "Company Suspect Drugs",
    "Active MAH",
    "Co-Suspect Drugs",
    "Concomitant Medications",
    "Treatment Medications",
    "Clinical Events",
    "Special Situations",
    "Event Severity",
    "Seriousness",
    "Patient Safety",
    "Patient Identification / PII",
    "COI",
    "Screening Decision",
    "Flags",
    "Generated At",
  ];

  const csvRows = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) =>
      [
        row.pmid,
        row.title,
        row.product,
        row.country,
        row.author,
        row.confidence,
        row.company_suspect_drugs,
        row.active_mah,
        row.co_suspect_drugs,
        row.concomitant_medications,
        row.treatment_medications,
        row.clinical_events,
        row.special_situations,
        row.event_severity,
        row.seriousness,
        row.patient_safety,
        row.patient_identification_pii,
        row.coi,
        row.screening_decision,
        row.flags,
        row.generated_at,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  return new NextResponse(csvRows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clinixai-screening-report.csv"`,
    },
  });
}
