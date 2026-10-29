"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import OperationalState from "@/components/enterprise/OperationalState";
import ScreeningWorkspace from "@/components/ScreeningWorkspace";
import {useRecordLock} from "@/hooks/useRecordLock";
import ScreeningFilterBar, { EMPTY_SCREENING_FILTERS, matchesScreeningFilters, type ScreeningFilters } from "@/components/screening-frs/ScreeningFilterBar";

type AuditEvent = {
  id: string;
  timestamp: string;
  module: string;
  action: string;
  oldValue: string;
  newValue: string;
  reason: string;
  performedBy: string;
  role: string;
};

export type ScreeningArticle = {
  hit_id: string;
  database_package_id: string;
  screening_result_id?: string;
  intake_export_id?: string;
  review_version: number;
  execution_status: "ready" | "completed" | "failed";
  context_stage: "HITS_APPROVED" | "SCREENING_AI";
  pmid: string;
  title: string;
  journal: string;
  publication_date: string;
  date_received: string;
  origin_database: string;
  causality: string;
  listedness: string;
  susar: string;
  product_name: string;
  country_of_interest: string;
  primary_author: string;
  confidence_score: number;
  hits_status: string;
  screening_status: "ready" | "completed" | "excluded";
  intake_status: "pending" | "ready";
  qc_required: boolean;
  company_suspect_drugs: string[];
  active_mah: string;
  publication_classification: string;
  generic_icsr_status: string;
  company_applicability: string;
  co_suspect_drugs: string[];
  concomitant_medications: string[];
  treatment_medications: string[];
  clinical_events: string[];
  special_situations: string[];
  event_severity: string;
  seriousness: string;
  patient_safety: "Yes" | "No" | "Uncertain";
  patient_identification_pii: "Yes" | "No" | "Uncertain";
  coi: "Yes" | "No" | "Uncertain";
  screening_decision: string;
  screening_reasoning: string;
  evidence_sentence: string;
  flags: string[];
  audit_trail: AuditEvent[];
};

function list(value?: string[]) {
  return value?.length ? value.join(", ") : "—";
}

type IncomingScreeningArticle = Record<string, unknown> & {
  findings?: Array<{ rule?: unknown; passed?: unknown; comment?: unknown }>;
  authors?: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeArticle(input: unknown): ScreeningArticle {
  const raw = (isRecord(input) ? input : {}) as IncomingScreeningArticle;
  const findings = Array.isArray(raw.findings) ? raw.findings : [];
  const decision = stringValue(raw.decision, "REVIEW");
  const reviewStatus = stringValue(raw.reviewStatus, "pending");
  const executionStatus = stringValue(raw.executionStatus, "ready") as
    "ready" | "completed" | "failed";
  const contextStage =
    stringValue(raw.contextStage) === "SCREENING_AI"
      ? "SCREENING_AI"
      : "HITS_APPROVED";
  const product = stringValue(raw.productName, "Not identified");
  const passedFindings = findings
    .filter((finding) => finding.passed === true)
    .map((finding) => stringValue(finding.rule))
    .filter(Boolean);
  const safetyAssessment = isRecord(raw.patientSafetyAssessment)
    ? raw.patientSafetyAssessment
    : {};
  const safetyEvidence = isRecord(raw.safetyEvidence)
    ? raw.safetyEvidence
    : {};
  const icsrAssessment = isRecord(raw.icsrAssessment)
    ? raw.icsrAssessment
    : {};
  const companyAssessments = Array.isArray(raw.companySuspectAssessments)
    ? raw.companySuspectAssessments.filter(isRecord)
    : [];
  const extractedProducts = Array.isArray(raw.extractedSuspectEvidence)
    ? raw.extractedSuspectEvidence.filter(isRecord)
    : [];
  const regulatoryEvidence = isRecord(raw.regulatoryEvidence)
    ? raw.regulatoryEvidence
    : {};
  const clinicalEventRecords = Array.isArray(regulatoryEvidence.clinicalEvents)
    ? regulatoryEvidence.clinicalEvents.filter(isRecord)
    : [];
  const confirmedCompanyProducts = companyAssessments
    .filter((assessment) => assessment.conclusion === "CONFIRMED")
    .map((assessment) => stringValue(assessment.reportedProduct))
    .filter(Boolean);
  const matchedCompanyProducts = companyAssessments
    .filter((assessment) => assessment.productMatched === true)
    .map((assessment) => stringValue(assessment.reportedProduct))
    .filter(Boolean);
  const companyApplicabilityUnresolved = companyAssessments.some(
    (assessment) => assessment.conclusion === "UNRESOLVED",
  );
  const matchedCompanyAssessments = companyAssessments.filter(
    (assessment) => assessment.productMatched === true,
  );
  const licenceAssessmentScope =
    matchedCompanyAssessments.length > 0
      ? matchedCompanyAssessments
      : companyAssessments;
  const licenceStatuses = licenceAssessmentScope
    .map((assessment) => stringValue(assessment.licenceStatus))
    .filter(Boolean);
  const activeMah: ScreeningArticle["active_mah"] =
    licenceStatuses.includes("ACTIVE")
      ? "ACTIVE"
      : licenceStatuses.length > 0 &&
          licenceStatuses.every((status) => status === "NOT_CONFIGURED")
        ? "NOT_CONFIGURED"
        : licenceStatuses.length > 0 &&
            licenceStatuses.every((status) => status === "INACTIVE")
          ? "INACTIVE"
          : "UNRESOLVED";
  const companyApplicability =
    companyAssessments.some((assessment) => assessment.conclusion === "CONFIRMED")
      ? "CONFIRMED"
      : companyAssessments.some((assessment) => assessment.conclusion === "UNRESOLVED")
        ? "UNRESOLVED"
        : companyAssessments.length > 0
          ? companyAssessments.map((assessment) => stringValue(assessment.conclusion)).filter(Boolean).join(", ")
          : "UNRESOLVED";
  const productRole = (role: string) =>
    extractedProducts
      .filter((item) => stringValue(item.role) === role)
      .map((item) => stringValue(item.reportedProduct))
      .filter(Boolean);
  const allSuspects = productRole("SUSPECT");
  const confirmedCompanySet = new Set(confirmedCompanyProducts.map((value) => value.toLowerCase()));
  const coSuspects = allSuspects.filter(
    (value) => !confirmedCompanySet.has(value.toLowerCase()),
  );
  const upstreamHitsDetectedEvents = Array.isArray(raw.upstreamHitsDetectedEvents)
    ? raw.upstreamHitsDetectedEvents.map((event) => stringValue(event)).filter(Boolean)
    : [];
  const clinicalEvents = clinicalEventRecords
    .map((event) => stringValue(event.event))
    .filter(Boolean);
  const severitySummary = clinicalEventRecords
    .map((eventRecord) => {
      const eventName = stringValue(eventRecord.event);
      const severity = stringValue(eventRecord.severity, "UNRESOLVED");
      return eventName ? `${eventName}: ${severity}` : severity;
    })
    .filter(Boolean);
  const seriousnessSummary = clinicalEventRecords
    .map((eventRecord) => {
      const eventName = stringValue(eventRecord.event);
      const seriousness = stringValue(eventRecord.seriousness, "UNRESOLVED");
      const criteria = Array.isArray(eventRecord.seriousnessCriteria)
        ? eventRecord.seriousnessCriteria.map((item) => stringValue(item)).filter(Boolean)
        : [];
      const detail = criteria.length ? `${seriousness} [${criteria.join(", ")}]` : seriousness;
      return eventName ? `${eventName}: ${detail}` : detail;
    })
    .filter(Boolean);
  const piiStatus = stringValue(regulatoryEvidence.patientPiiStatus, "UNRESOLVED");
  const coiStatus = stringValue(regulatoryEvidence.countryOfIncidenceStatus, "UNRESOLVED");
  const coiValue =
    coiStatus === "PRESENT"
      ? stringValue(regulatoryEvidence.countryOfIncidence, "Uncertain")
      : stringValue(raw.countryOfInterest, "Uncertain");
  const patientSafety: ScreeningArticle["patient_safety"] =
    safetyAssessment.relevance === "RELEVANT"
      ? "Yes"
      : safetyAssessment.relevance === "NOT_RELEVANT"
        ? "No"
        : "Uncertain";
  const eventEvidence = stringValue(safetyEvidence.eventEvidence);
  const specialSituationEvidence = stringValue(
    safetyEvidence.specialSituationEvidence,
  );

  return {
    hit_id: stringValue(raw.screeningResultId) || `SCR-${stringValue(raw.packageId)}`,
    database_package_id: stringValue(raw.packageId),
    screening_result_id: stringValue(raw.screeningResultId) || undefined,
    intake_export_id: stringValue(raw.intakeExportId) || undefined,
    review_version: Number(raw.reviewVersion || 0),
    execution_status: executionStatus,
    context_stage: contextStage,
    pmid: stringValue(raw.pmid, "—"),
    title: stringValue(raw.title, "—"),
    journal: stringValue(raw.journal, "—"),
    publication_date: stringValue(raw.publicationDate, "—"),
    // Do not substitute publication date when source receipt date is missing.
    date_received: stringValue(raw.receivedAt) || stringValue(raw.dateReceived),
    origin_database: stringValue(raw.originDatabase) || stringValue(raw.sourceDatabase),
    causality: stringValue(raw.causality, "Not assessed"),
    listedness: stringValue(raw.listedness, "Not assessed"),
    susar: stringValue(raw.susar, "Not assessed"),
    product_name: product,
    country_of_interest: coiValue,
    primary_author:
      Array.isArray(raw.authors) && raw.authors.length > 0 ? stringValue(raw.authors[0], "—") : "—",
    confidence_score: Number(raw.confidence || 0) / 100,
    hits_status:
      contextStage === "HITS_APPROVED"
        ? "Approved Hits context"
        : "Screening AI completed",
    screening_status:
      reviewStatus === "approved"
        ? "completed"
        : reviewStatus === "excluded"
          ? "excluded"
          : "ready",
    intake_status: stringValue(raw.intakeExportId) ? "ready" : "pending",
    qc_required: Boolean(raw.qcRequired) || executionStatus === "failed",
    company_suspect_drugs:
      confirmedCompanyProducts.length > 0
        ? confirmedCompanyProducts
        : matchedCompanyProducts.length > 0 && companyApplicabilityUnresolved
          ? matchedCompanyProducts.map(
              (productName) => `${productName} (Product Master matched; COI unresolved)`,
            )
          : companyApplicabilityUnresolved
            ? ["Company applicability unresolved"]
            : ["None confirmed"],
    active_mah: activeMah,
    publication_classification: stringValue(
      regulatoryEvidence.publicationClassification,
      "UNRESOLVED",
    ),
    generic_icsr_status: stringValue(icsrAssessment.conclusion, "UNRESOLVED"),
    company_applicability: companyApplicability,
    co_suspect_drugs: coSuspects.length ? coSuspects : ["None identified"],
    concomitant_medications: productRole("CONCOMITANT").length
      ? productRole("CONCOMITANT")
      : ["None identified"],
    treatment_medications: productRole("TREATMENT").length
      ? productRole("TREATMENT")
      : ["None identified"],
    clinical_events:
      clinicalEvents.length
        ? clinicalEvents
        : contextStage === "HITS_APPROVED" && upstreamHitsDetectedEvents.length
          ? upstreamHitsDetectedEvents
          : eventEvidence
            ? [eventEvidence]
            : passedFindings.length
              ? passedFindings
              : ["Not identified"],
    special_situations:
      safetyEvidence.specialSituation === "PRESENT"
        ? [specialSituationEvidence || "Special situation identified"]
        : safetyEvidence.specialSituation === "UNRESOLVED" ||
            safetyEvidence.specialSituation === "CONFLICTING"
          ? ["Unresolved"]
          : ["None identified"],
    event_severity: severitySummary.length ? severitySummary.join("; ") : "UNRESOLVED",
    seriousness: seriousnessSummary.length ? seriousnessSummary.join("; ") : "UNRESOLVED",
    patient_safety: patientSafety,
    patient_identification_pii:
      piiStatus === "PRESENT" ? "Yes" : piiStatus === "ABSENT" ? "No" : "Uncertain",
    coi: coiStatus === "PRESENT" ? "Yes" : coiStatus === "ABSENT" ? "No" : "Uncertain",
    screening_decision:
      contextStage === "HITS_APPROVED" && executionStatus === "ready"
        ? "AWAITING_AI"
        : decision,
    screening_reasoning:
      contextStage === "HITS_APPROVED" && executionStatus === "ready"
        ? "Approved Hits evidence is carried forward for context. Screening AI has not run yet."
        : stringValue(raw.reason, "Manual review required."),
    evidence_sentence:
      findings
        .map((finding) => stringValue(finding.comment))
        .filter(Boolean)
        .join(" ") || "—",
    flags: [
      ...(Boolean(raw.qcRequired) ? ["QC required"] : []),
      ...(patientSafety === "Uncertain" ? ["Patient-safety relevance unresolved"] : []),
      ...(companyApplicabilityUnresolved ? ["Company applicability unresolved"] : []),
      ...(activeMah === "NOT_CONFIGURED" ? ["MAH / licence configuration not available"] : []),
      ...(icsrAssessment.conclusion === "UNRESOLVED" ? ["Generic ICSR criteria unresolved"] : []),
      ...(piiStatus === "CONFLICTING" ? ["Patient PII evidence conflicting"] : []),
      ...(coiStatus === "CONFLICTING" ? ["Country-of-incidence evidence conflicting"] : []),
      ...(executionStatus === "failed"
        ? [stringValue(raw.error, "Screening execution failed")]
        : []),
    ],
    audit_trail: [],
  };
}

export default function ScreeningPage() {
  const [articles, setArticles] = useState<ScreeningArticle[]>([]);
  const [selected, setSelected] = useState<ScreeningArticle | null>(null);
  const recordLock=useRecordLock(selected?.database_package_id||null,"SCREENING",Boolean(selected));
  const [activeTab, setActiveTab] = useState("Overview");
  const [search, setSearch] = useState("");
  const [worklistView,setWorklistView]=useState<"queue"|"mine">("queue");
  const [myAssignments,setMyAssignments]=useState<Array<{assignment_id:string;record_id:string;package_key:string;status:string;lock_status:string}>>([]);
  const [assignmentError,setAssignmentError]=useState("");
  useEffect(()=>{if(worklistView!=="mine")return;let cancelled=false;void fetch("/api/v1/my-assignments?stage=SCREENING",{cache:"no-store"}).then(async r=>{const x=await r.json();if(!r.ok||!x.success)throw new Error("Assignments unavailable");if(!cancelled){setMyAssignments(x.data.records);setAssignmentError("");}}).catch(()=>{if(!cancelled){setMyAssignments([]);setAssignmentError("Unable to load assignments");}});return()=>{cancelled=true};},[worklistView]);
  const [screeningFilters, setScreeningFilters] = useState<ScreeningFilters>({...EMPTY_SCREENING_FILTERS});
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  }, []);

  const loadScreeningArticles = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetch("/api/literature/screening?limit=500", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Screening API returned HTTP ${response.status}.`);
      }

      const data = await response.json();

      if (!Array.isArray(data?.data?.records)) {
        showToast("No screening output found.");
        setArticles([]);
        return;
      }

      setArticles(data.data.records.map(normalizeArticle));
    } catch {
      showToast("Unable to load screening output.");
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadScreeningArticles(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadScreeningArticles]);

  const visibleArticles = useMemo(() => {
    const query=search.toLowerCase().trim();
    return articles.filter(article=>{
      if(!matchesScreeningFilters(article,screeningFilters))return false;
      if(!query)return true;
      return [article.pmid,article.title,article.product_name,article.country_of_interest,
        article.primary_author,article.screening_decision,...article.company_suspect_drugs,
        ...article.clinical_events].join(" ").toLowerCase().includes(query);
    }).sort((x,y)=>y.date_received.localeCompare(x.date_received)||x.hit_id.localeCompare(y.hit_id));
  },[articles,search,screeningFilters]);
  function exportLoadedCsv() {
    const columns = ["Screening ID","Date Received","Database","PMID","Title","Product/INN","Events",
      "COI","Seriousness","Causality","Listedness","SUSAR","Status"];
    // Export is deliberately restricted to authorized records loaded in this session.
    // Never label this as a full-database regulatory line listing.
    const safe=(v:string) => {
      const t=/^[=+@\-\t\r]/.test(v)?"'"+v:v;
      return '"'+t.replace(/"/g,'""')+'"';
    };
    const lines=[columns,...visibleArticles.map(x=>[x.hit_id,x.date_received,x.origin_database,x.pmid,
      x.title,x.product_name,x.clinical_events.join("; "),x.country_of_interest,
      x.seriousness,x.causality,x.listedness,x.susar,x.screening_status])];
    const csv="\uFEFF"+lines.map(row=>row.map(v=>safe(String(v||""))).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="screening-loaded-records.csv";
    document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  }

  const awaitingAiCount = articles.filter(
    (article) => article.execution_status === "ready",
  ).length;
  const awaitingReviewCount = articles.filter(
    (article) =>
      article.execution_status === "completed" &&
      article.screening_status === "ready",
  ).length;

  async function generateDownstreamOutput(reason: string) {
    if (!selected) return;
    if (!selected.screening_result_id) {
      showToast("Run Screening AI before approving this article.");
      return;
    }
    if (await saveReviewMutation("approved", selected.screening_decision, reason)) {
      showToast("Screening decision approved and routed to the Review / MR workspace.");
    }
  }

  async function excludeArticle(reason: string) {
    if (!selected) return;
    if (!selected.screening_result_id) {
      showToast("Run Screening AI before excluding this article.");
      return;
    }
    if (await saveReviewMutation("excluded", "EXCLUDE", reason)) {
      showToast("Screening article excluded.");
    }
  }

  async function saveReview(reason: string) {
    if (!selected) return;
    if (!selected.screening_result_id) {
      showToast("Run Screening AI before saving a review.");
      return;
    }
    if (await saveReviewMutation("flagged", "REVIEW", reason)) {
      showToast("Screening review saved.");
    }
  }

  async function rerunAI(reason: string) {
    if (!selected) return;
    const proof=recordLock.getProof();
    if(!proof){showToast("Read-only: edit lease required for AI re-run.");return;}
    const response = await fetch("/api/literature/screening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "execute",
        input: { packageId: selected.database_package_id, reason, ...proof },
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      showToast(payload?.error || "Screening AI execution failed.");
      return;
    }
    await loadScreeningArticles();
    setSelected(normalizeArticle(payload.data));
    showToast("Screening AI execution completed and routed to human review.");
  }

  async function saveReviewMutation(
    status: "approved" | "excluded" | "flagged",
    finalDecision: string,
    comments: string,
  ): Promise<boolean> {
    if (!selected?.screening_result_id) return false;
    const proof=recordLock.getProof();
    if(!proof){showToast("Read-only: active edit lease required.");return false;}
    const response = await fetch("/api/literature/screening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "review",
        input: {
          packageId: selected.database_package_id,
          screeningResultId: selected.screening_result_id,
          status,
          finalDecision,
          comments,
          expectedVersion: selected.review_version,
          ...proof,
        },
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      showToast(payload?.error || "Screening review could not be saved.");
      return false;
    }
    await loadScreeningArticles();
    setSelected(null);
    return true;
  }

  const completedCount = articles.filter(
    (article) => article.screening_status === "completed",
  ).length;

  const reviewReadyCount = articles.filter(
    (article) =>
      article.screening_status === "completed" &&
      article.screening_decision === "INCLUDE",
  ).length;

  return (
    <ApplicationShell module="LITERATURE">
      <header className="nxs-screening-heading">
        <h1>Screening</h1>
        <span>Article worklist · Human decisions remain governed</span>
      </header>
      <section className="metrics-grid">
        <Metric label="Screening Worklist Items" value={articles.length} />
        <Metric label="Awaiting Screening AI" value={awaitingAiCount} tone="warning" />
        <Metric label="Awaiting Human Review" value={awaitingReviewCount} tone="warning" />
        <Metric label="Completed Reviews" value={completedCount} tone="success" />
        <Metric label="Ready for Review / MR" value={reviewReadyCount} tone="primary" />
        <Metric
          label="Serious Findings"
          value={articles.filter((article) => article.seriousness.includes("SERIOUS")).length}
          tone="critical"
        />
      </section>

      <ScreeningFilterBar value={screeningFilters} onChange={setScreeningFilters}
        loadedCount={articles.length} matchingCount={visibleArticles.length}
        limitations="Client-side filtering applies to at most 500 loaded authorized records; full-database search and exports require a scoped backend endpoint." />
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-kicker">Medical review worklist</span>
            <h2>Screening Records</h2>
            <p>
              {loading
                ? "Loading governed screening results…"
                : `${awaitingAiCount} awaiting Screening AI; ${awaitingReviewCount} awaiting human review; ${reviewReadyCount} ready for Review / MR`}
            </p>
          </div>

          <div className="panel-actions">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search PMID, product, event…"
              aria-label="Search screening worklist"
            />

            <button type="button" onClick={exportLoadedCsv}>CSV · loaded subset</button>

            <button type="button" onClick={() => void loadScreeningArticles()}>
              Refresh
            </button>

            <button
              type="button"
              onClick={async () => {
                const response = await fetch("/api/reports/hits-screening", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({}),
                });
                if (!response.ok) {
                  showToast("Governed screening report could not be generated.");
                  return;
                }
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "clinixai-literature-line-listing.xlsx";
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
              }}
            >
              Governed XLSX (unfiltered)
            </button>
          </div>
        </div>

        <div className="nxs-screening-tabs" role="tablist" aria-label="Screening worklists">
          <button type="button" role="tab" aria-selected={worklistView==="queue"} onClick={()=>setWorklistView("queue")}>Screening Queue ({visibleArticles.length})</button>
          <button type="button" role="tab" aria-selected={worklistView==="mine"} onClick={()=>setWorklistView("mine")}>My Assignments</button>
        </div>
        {worklistView==="mine"&&<div className="nxs-my-work">{assignmentError&&<div role="alert">{assignmentError}</div>}{myAssignments.length===0&&!assignmentError&&<p>No active Screening assignments.</p>}<table><thead><tr><th>Record</th><th>Assignment</th><th>Lock</th><th>Action</th></tr></thead><tbody>{myAssignments.map(a=><tr key={a.assignment_id}><td>{a.package_key}</td><td>{a.status}</td><td>{a.lock_status}</td><td><button type="button" onClick={()=>{const article=articles.find(x=>x.database_package_id===a.record_id);if(article)setSelected(article);else showToast("Assigned record is not in the loaded worklist. Refresh or expand the worklist.");}}>Open</button></td></tr>)}</tbody></table></div>}
        {worklistView==="queue"&&<div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Received ↓</th><th>Origin DB</th><th>QC</th>
                <th>PMID</th>
                <th>Product</th>
                <th>Country</th>
                <th>Reporter</th>
                <th>Company Product Context</th>
                <th>Active MAH</th>
                <th>Clinical Event</th>
                <th>Seriousness</th>
                <th>PII</th>
                <th>COI</th>
                <th>Decision</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {visibleArticles.map((article) => (
                <tr key={article.hit_id}>
                  <td>{article.date_received || "Unavailable"}</td><td>{article.origin_database || "Unavailable"}</td>
                  <td>
                    <span
                      className={`qc-badge ${
                        article.execution_status === "ready"
                          ? "pending"
                          : article.qc_required
                            ? "required"
                            : ""
                      }`}
                    >
                      {article.execution_status === "ready"
                        ? "Pending"
                        : article.qc_required
                          ? "QC"
                          : "Pass"}
                    </span>
                  </td>
                  <td className="mono">{article.pmid}</td>
                  <td>
                    <strong>{article.product_name}</strong>
                    <small>{article.hits_status}</small>
                  </td>
                  <td>{article.country_of_interest}</td>
                  <td>{article.primary_author}</td>
                  <td>{list(article.company_suspect_drugs)}</td>
                  <td>{article.active_mah}</td>
                  <td>{list(article.clinical_events)}</td>
                  <td>{article.seriousness}</td>
                  <td>{article.patient_identification_pii}</td>
                  <td>{article.coi}</td>
                  <td>
                    <span className="decision">{article.screening_decision}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="review-button"
                      onClick={() => {
                        setSelected(article);
                        setActiveTab("Overview");
                      }}
                    >
                      {article.screening_status === "completed"
                        ? "Open Review"
                        : "Review"}
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && visibleArticles.length === 0 && (
                <tr>
                  <td colSpan={15} className="empty">
                    No screening results match the current search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>}
      </section>

      {selected && (
        <ScreeningWorkspace
          article={selected}
          readOnly={recordLock.readOnly}
          lockMessage={recordLock.message|| (recordLock.state==="acquiring"?"Acquiring edit access…":"")}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={() => setSelected(null)}
          onApprove={generateDownstreamOutput}
          onExclude={excludeArticle}
          onSave={saveReview}
          onRerunAI={rerunAI}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      <style jsx>{`
        .nxs-screening-tabs{display:flex;background:var(--nx-surface);border-bottom:1px solid var(--nx-border)}
        .nxs-screening-tabs button{border-radius:0;background:white;color:var(--nx-text-muted);border:0;border-bottom:2px solid transparent}
        .nxs-screening-tabs button[aria-selected="true"]{border-bottom-color:var(--nx-primary);color:var(--nx-primary)}
        .nxs-my-work{max-height:calc(100vh - 275px);overflow:auto;padding:8px;background:white}
        .nxs-not-ready{padding:14px;background:var(--nx-warning-subtle);color:#5d4700;font-size:11px}
        .table-wrap{max-height:calc(100vh - 275px);overflow:auto}

        .nxs-screening-heading{display:flex;gap:14px;align-items:baseline;padding:5px 3px;margin:0}
        .nxs-screening-heading h1{font-size:17px;line-height:1.3;margin:0;color:var(--nx-text)}
        .nxs-screening-heading span{font-size:11px;color:var(--nx-text-muted)}
        .metrics-grid{display:flex!important;gap:0!important;margin:3px 0!important;background:var(--nx-surface);border:1px solid var(--nx-border);overflow-x:auto}
        .metrics-grid :global(article){flex:1;min-width:125px;min-height:38px!important;padding:5px 9px!important;border:0!important;border-right:1px solid var(--nx-border)!important;border-radius:0!important;box-shadow:none!important}
        .metrics-grid :global(article span){min-height:0!important;font-size:9px!important;letter-spacing:0!important}
        .metrics-grid :global(article strong){display:inline!important;font-size:15px!important;margin:0!important}
        .panel{border-radius:0!important;box-shadow:none!important}
        .panel-header{padding:9px 12px!important}
        th,td{padding:6px 8px!important;font-size:10px!important}
        th{position:sticky;top:0;z-index:2;background:var(--nx-border)!important}

        .app-shell {
          min-height: 100vh;
          padding: 24px;
          color: var(--nx-text);
          background:
            radial-gradient(circle at 3% 0%, rgba(56, 189, 248, 0.08), transparent 23%), var(--nx-surface);
          font-family: "Poppins", Arial, Helvetica, sans-serif;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 12px;
          margin-bottom: 18px;
        }

        .panel {
          overflow: hidden;
          border: 1px solid var(--nx-border);
          border-radius: 21px;
          background: var(--nx-surface);
          box-shadow: 0 12px 34px rgba(15, 23, 42, 0.06);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
          padding: 23px 24px;
          border-bottom: 1px solid var(--nx-border);
        }

        .section-kicker {
          color: var(--nx-primary);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .panel-header h2 {
          margin: 5px 0;
          font-size: 22px;
          letter-spacing: -0.02em;
        }

        .panel-header p {
          margin: 0;
          color: var(--nx-text-muted);
          font-size: 12px;
        }

        .panel-actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .panel-actions input {
          min-width: 230px;
          padding: 10px 12px;
          border: 1px solid var(--nx-border);
          border-radius: 10px;
          outline: none;
          font: inherit;
          font-size: 11px;
        }

        .panel-actions input:focus {
          border-color: var(--nx-primary);
          box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.1);
        }

        .panel-actions button,
        .panel-actions a {
          display: inline-flex;
          align-items: center;
          min-height: 36px;
          padding: 8px 11px;
          border: 1px solid var(--nx-border);
          border-radius: 10px;
          color: var(--nx-text);
          background: var(--nx-surface);
          font: inherit;
          font-size: 10px;
          font-weight: 900;
          text-decoration: none;
          cursor: pointer;
        }

        .panel-actions .primary-action {
          border-color: var(--nx-primary);
          color: var(--nx-surface);
          background: var(--nx-primary);
        }

        .filters-row {
          display: flex;
          gap: 8px;
          padding: 12px 18px;
          overflow-x: auto;
          border-bottom: 1px solid var(--nx-border);
          background: var(--nx-surface);
        }

        .filters-row button {
          border: 1px solid var(--nx-border);
          border-radius: 999px;
          padding: 7px 10px;
          color: #475569;
          background: var(--nx-surface);
          font: inherit;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
        }

        .table-wrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          min-width: 1480px;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 13px 14px;
          border-bottom: 1px solid var(--nx-border);
          text-align: left;
          vertical-align: middle;
          font-size: 11px;
        }

        th {
          color: var(--nx-text-muted);
          background: var(--nx-surface);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.055em;
          text-transform: uppercase;
        }

        tbody tr:hover {
          background: var(--nx-surface);
        }

        td strong,
        td small {
          display: block;
        }

        td small {
          margin-top: 3px;
          color: #94a3b8;
          font-size: 9px;
        }

        .mono {
          color: #1e3a8a;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-weight: 800;
        }

        .qc-badge,
        .decision {
          display: inline-flex;
          padding: 6px 8px;
          border-radius: 999px;
          color: #166534;
          background: var(--nx-success-subtle);
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .qc-badge.required {
          color: #92400e;
          background: var(--nx-warning-subtle);
        }

        .qc-badge.pending {
          color: var(--nx-primary-active);
          background: var(--nx-border);
        }

        .decision {
          color: var(--nx-primary-active);
          background: var(--nx-border);
        }

        .review-button {
          border: 0;
          border-radius: 9px;
          padding: 8px 10px;
          color: var(--nx-surface);
          background: var(--nx-primary);
          font: inherit;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .empty {
          padding: 38px;
          color: var(--nx-text-muted);
          text-align: center;
        }

        .toast {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 70;
          max-width: 460px;
          padding: 14px 18px;
          border-radius: 14px;
          color: var(--nx-surface);
          background: var(--nx-text);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.28);
          font-size: 12px;
          font-weight: 700;
        }

        @media (max-width: 1200px) {
          .metrics-grid {
            grid-template-columns: repeat(3, 1fr);
          }

          .panel-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .panel-actions {
            justify-content: flex-start;
          }
        }

        @media (max-width: 700px) {
          .app-shell {
            padding: 12px;
          }

          .metrics-grid {
            grid-template-columns: 1fr 1fr;
          }

          .panel-actions input {
            width: 100%;
            min-width: 0;
          }
        }

        @media (max-width: 440px) {
          .metrics-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </ApplicationShell>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning" | "success" | "primary" | "critical";
}) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>

      <style jsx>{`
        .metric {
          min-height: 102px;
          padding: 16px;
          border: 1px solid var(--nx-border);
          border-radius: 17px;
          background: var(--nx-surface);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.045);
        }

        span {
          display: block;
          min-height: 31px;
          color: var(--nx-text-muted);
          font-size: 10px;
          line-height: 1.35;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.045em;
        }

        strong {
          display: block;
          margin-top: 8px;
          color: var(--nx-text);
          font-size: 27px;
        }

        .warning {
          border-color: #fde68a;
          background: var(--nx-surface);
        }

        .success {
          border-color: #bbf7d0;
          background: var(--nx-surface);
        }

        .primary {
          border-color: #bfdbfe;
          background: var(--nx-surface);
        }

        .critical {
          border-color: #fecaca;
          background: var(--nx-surface);
        }
      `}</style>
    </article>
  );
}
