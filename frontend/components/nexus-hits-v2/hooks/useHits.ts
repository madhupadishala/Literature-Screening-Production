"use client";
import { useEffect, useMemo, useState } from "react";
import { useRecordLock } from "@/hooks/useRecordLock";
import { fetchLiveHits, downloadHitsCsv } from "./hits-utils";
import { createSubmitHitsReview } from "./hits-review-actions";
import { createChooseAction } from "./hits-actions";
export type Hit = {
  id: string;
  database: string;
  doi: string;
  pmid: string;
  title: string;
  language: string;
  primary: string;
  secondary: string;
  country: string;
  seriousness: string;
  product: string;
  events: string;
  articleType: string;
  fullText: boolean;
  safety: boolean;
  evidence: string;
  listedness: string;
  relatedness: string;
  susar: string;
  date: string;
  packageId?: string;
  hitsResultId?: string;
  reviewVersion?: number;
};
export type SearchHit = { hit: Hit; decision: "Unreviewed" | "Yes" | "No" | "Re-review"; match: string; source: "duplicate" | "manual" };
const previewFixtures: Hit[] = [];
const searchable = (x: Hit, q: string) =>
  !q || [x.title, x.id, x.pmid, x.doi, x.product, x.events, x.primary].some((v) => v.toLowerCase().includes(q.toLowerCase()));
const matchOf = (x: Hit, items: Hit[]) => items.find((y) => y.id === x.id || y.pmid === x.pmid || y.doi === x.doi)?.id || "";
export function useHits() {
  const [open, setOpen] = useState<Record<string, boolean>>({
    dup: true,
    dupForm: true,
    dupResults: true,
    manual: true,
    manualForm: true,
    manualResults: true,
    queue: true,
    mine: true,
  });
  const [query, setQuery] = useState({ dup: "", manual: "" });
  const [db, setDb] = useState("All");
  const [rows, setRows] = useState<{ dup: SearchHit[]; manual: SearchHit[] }>({ dup: [], manual: [] });
  const [queue, setQueue] = useState<Hit[]>([]);
  const [loadError, setLoadError] = useState("");
  const previewEnabled = process.env.NEXT_PUBLIC_NEXUS_HITS_FIXTURES === "true" && process.env.NODE_ENV !== "production";
  const [liveLoaded, setLiveLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<"readonly" | "review">("readonly");
  const [completed, setCompleted] = useState<string[]>([]);
  const [rereview, setRereview] = useState<string[]>([]);
  const [menuRecord, setMenuRecord] = useState<string | null>(null);
  const [savingReview, setSavingReview] = useState(false);
  const [selection, setSelection] = useState<{ kind: "dup" | "manual" | "queue"; id: string } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [addTarget, setAddTarget] = useState<{ kind: "dup" | "manual"; id: string } | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [worklistView, setWorklistView] = useState<"queue" | "mine">("queue");
  const [audit, setAudit] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);
  const [fileFormat, setFileFormat] = useState("csv");
  const [assigned, setAssigned] = useState<string[]>([]);
  const [draftFilters, setDraftFilters] = useState({
    product: "",
    database: "",
    seriousness: "",
    country: "",
    listedness: "",
    relatedness: "",
    susar: "",
    from: "",
    to: "",
  });
  const loadHits = async () => {
    try {
      const records = await fetchLiveHits();
      setQueue(records);
      setLiveLoaded(true);
      setLoadError("");
    } catch (e) {
      setQueue([]);
      setLiveLoaded(false);
      setLoadError(e instanceof Error ? e.message : "Live Hits could not be loaded");
    }
  };
  useEffect(() => {
    void loadHits();
  }, []);
  useEffect(() => {
    if (!liveLoaded) return;
    let active = true;
    void fetch("/api/v1/my-assignments?stage=HITS", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Assignments unavailable");
        const body = await response.json();
        if (!body.success || !Array.isArray(body.data?.records)) throw new Error("Invalid assignments");
        const packageIds = new Set<string>(body.data.records.map((record: { record_id: string }) => record.record_id));
        if (active) setAssigned(queue.filter((hit) => hit.packageId && packageIds.has(hit.packageId)).map((hit) => hit.id));
      })
      .catch(() => {
        if (active) setNotice("My Assignments could not be loaded from the server.");
      });
    return () => {
      active = false;
    };
  }, [liveLoaded, queue]);
  const activeQueueRecord = selection?.kind === "queue" ? queue.find((x) => x.id === selection.id) : null;
  const recordLock = useRecordLock(
    viewMode === "review" && activeQueueRecord?.packageId ? activeQueueRecord.packageId : null,
    "HITS",
    viewMode === "review" && Boolean(activeQueueRecord?.packageId),
  );
  const submitHitsReview = createSubmitHitsReview({
    activeQueueRecord,
    recordLock,
    reviewNotes,
    setNotice,
    setSavingReview,
    setSelection,
    setReviewNotes,
    loadHits,
  });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const existing = () => [...queue, ...(previewEnabled ? previewFixtures.slice(0, 3) : [])];
  const run = (kind: "dup" | "manual") => {
    if (!previewEnabled) {
      setNotice("Preview search is disabled. No live duplicate/manual search is connected to this panel.");
      return;
    }
    const result = previewFixtures
      .filter((x) => searchable(x, query[kind]) && (kind === "dup" || db === "All" || db === x.database))
      .map((hit) => ({
        hit,
        decision: "Unreviewed" as const,
        match: matchOf(hit, existing()),
        source: kind === "dup" ? ("duplicate" as const) : ("manual" as const),
      }));
    setRows((r) => ({ ...r, [kind]: result }));
    setOpen((o) => ({ ...o, [kind + "Results"]: true }));
    setNotice(result.length ? result.length + " synthetic result(s), no live database or agent accessed" : "No matching records found");
  };
  const row = selection && selection.kind !== "queue" ? rows[selection.kind].find((x) => x.hit.id === selection.id) : null;
  const selected = selection?.kind === "queue" ? queue.find((x) => x.id === selection.id) : row?.hit;
  const decide = (d: SearchHit["decision"]) => {
    if (!selection || selection.kind === "queue" || !row) return;
    if (d === "No" && row.match) {
      setNotice("Blocked: record exists or duplicates " + row.match);
      return;
    }
    if (d === "Re-review" && !reviewNotes.trim()) {
      setNotice("Enter an escalation reason first");
      return;
    }
    const kind = selection.kind;
    const id = selection.id;
    setRows((r) => ({ ...r, [kind]: r[kind].map((x) => (x.hit.id === id ? { ...x, decision: d } : x)) }));
    setAudit((a) => [row.hit.id + ": duplicate review " + d + " (synthetic)", ...a]);
    setSelection(null);
    setReviewNotes("");
  };
  const add = () => {
    if (!addTarget || !reason.trim()) return;
    const x = rows[addTarget.kind].find((x) => x.hit.id === addTarget.id);
    if (!x || x.decision !== "No" || matchOf(x.hit, existing())) {
      setNotice("Addition blocked: review incomplete or record already exists");
      return;
    }
    if (!previewEnabled) {
      setNotice("Preview additions are disabled.");
      return;
    }
    setAudit((a) => [x.hit.id + ": preview add requested, reason: " + reason, ...a]);
    setNotice("Preview-only action recorded in browser activity; the live Hits queue was not modified.");
    setAddTarget(null);
    setReason("");
  };
  const [filters, setFilters] = useState(draftFilters);
  const filtered = useMemo(
    () =>
      queue.filter(
        (x) =>
          (!filters.product || searchable(x, filters.product)) &&
          (!filters.database || x.database === filters.database) &&
          (!filters.seriousness || x.seriousness === filters.seriousness) &&
          (!filters.country || x.country === filters.country) &&
          (!filters.listedness || x.listedness === filters.listedness) &&
          (!filters.relatedness || x.relatedness === filters.relatedness) &&
          (!filters.susar || x.susar === filters.susar) &&
          (!filters.from || x.date >= filters.from) &&
          (!filters.to || x.date <= filters.to),
      ),
    [queue, filters],
  );
  const showActions = (id: string) => {
    setSelection(null);
    setMenuRecord(id);
  };
  const openQueueRecord = (id: string, mode: "readonly" | "review") => {
    setMenuRecord(null);
    setViewMode(mode);
    setSelection({ kind: "queue", id });
    setReviewNotes("");
  };
  const chooseAction = createChooseAction({ menuRecord, queue, assigned, setAssigned, setMenuRecord, setNotice, openQueueRecord });
  const clearFilters = () => {
    const empty = { product: "", database: "", seriousness: "", country: "", listedness: "", relatedness: "", susar: "", from: "", to: "" };
    setDraftFilters(empty);
    setFilters(empty);
    setApplied(false);
  };
  const exportQueue = () => {
    if (fileFormat !== "csv") {
      setNotice("Only CSV export is available.");
      return;
    }
    downloadHitsCsv(filtered);
  };
  return {
    open,
    setOpen,
    query,
    setQuery,
    db,
    setDb,
    rows,
    setRows,
    queue,
    setQueue,
    loadError,
    previewEnabled,
    liveLoaded,
    viewMode,
    setViewMode,
    completed,
    rereview,
    menuRecord,
    setMenuRecord,
    savingReview,
    selection,
    setSelection,
    reviewNotes,
    setReviewNotes,
    addTarget,
    setAddTarget,
    reason,
    setReason,
    notice,
    setNotice,
    worklistView,
    setWorklistView,
    audit,
    applied,
    setApplied,
    fileFormat,
    setFileFormat,
    assigned,
    setAssigned,
    draftFilters,
    setDraftFilters,
    filters,
    setFilters,
    filtered,
    activeQueueRecord,
    recordLock,
    submitHitsReview,
    toggle,
    run,
    row,
    selected,
    decide,
    add,
    showActions,
    openQueueRecord,
    chooseAction,
    clearFilters,
    exportQueue,
  };
}
