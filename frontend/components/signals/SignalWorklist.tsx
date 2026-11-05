"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceContext } from "@/components/context/WorkspaceContext";
import { roleHasPermission, PERMISSIONS } from "@/lib/rbac/permissions";
import { DataGrid } from "@/components/ui/DataGrid";
import type { Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Notice } from "@/components/ui/Notice";
import styles from "@/components/enterprise/GovernedWorkspace.module.css";

type Signal = {
  id: string; signal_key: string; product_key: string; event_term: string;
  source_type: string; source_reference: string | null; detection_method: string;
  priority: string; status: string; detected_at: string; updated_at: string;
};
const sources = ["SPONTANEOUS_CASES", "LITERATURE", "CLINICAL", "REGULATORY", "AGGREGATE", "OTHER"];
type Draft = { signalKey: string; productKey: string; eventTerm: string; sourceType: string; sourceReference: string; detectionMethod: string; priority: string; detectedAt: string; reason: string };
const initialDraft: Draft = {signalKey:"", productKey:"", eventTerm:"", sourceType:"LITERATURE", sourceReference:"", detectionMethod:"MANUAL_REVIEW", priority:"NORMAL", detectedAt:"", reason:""};
const options = (values:string[], label:string) => [{value:"",label},...values.map(value=>({value,label:value.replaceAll("_"," ")}))];
function safeDate(v:string) {const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString("en-GB",{timeZone:"UTC"}):"—";}
export default function SignalWorklist() {
  const {state}=useWorkspaceContext();
  const c=state.context;
  const scope=c?[c.tenantId,c.workspaceId,c.environment,c.moduleKey].join(":"):"";
  const enabled=Boolean(c?.enabledModules.includes("SIGNAL_MANAGEMENT"));
  const canCreate=enabled&&Boolean(c&&roleHasPermission(c.roleKey,PERMISSIONS.SIGNAL_CREATE));
  const [rows,setRows]=useState<Signal[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("");
  const [method,setMethod]=useState("");
  const [priority,setPriority]=useState("");
  const [formOpen,setFormOpen]=useState(false);
  const [draft,setDraft]=useState<Draft>(initialDraft);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const req=useRef<AbortController|null>(null);
  const load=useCallback(async()=>{
    req.current?.abort();setRows([]);setError("");
    if(!scope||!enabled){setLoading(false);return;}
    const controller=new AbortController();req.current=controller;setLoading(true);
    try {
      const response=await fetch("/api/signals?limit=500",{cache:"no-store",signal:controller.signal});
      const body=await response.json();
      if(!response.ok||!body.success||!Array.isArray(body.data?.records))throw new Error(body.error||"Unable to retrieve signals.");
      if(!controller.signal.aborted)setRows(body.data.records);
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Signal worklist unavailable.");}
    finally{if(!controller.signal.aborted)setLoading(false);}
  },[scope,enabled]);
  useEffect(()=>{const t=window.setTimeout(()=>void load(),0);return()=>{clearTimeout(t);req.current?.abort();};},[load]);
  const methods=useMemo(()=>[...new Set(rows.map(r=>r.detection_method).filter(Boolean))].sort(),[rows]);
  const filtered=useMemo(()=>rows.filter(r=>
    (!status||r.status===status)&&(!method||r.detection_method===method)&&(!priority||r.priority===priority)&&
    (!query||[r.signal_key,r.product_key,r.event_term,r.source_type,r.source_reference||""].some(v=>v.toLowerCase().includes(query.toLowerCase().trim())))
  ),[rows,status,method,priority,query]);
  const dirty=Object.entries(draft).some(([key,value])=>value!==initialDraft[key as keyof Draft]);
  useEffect(()=>{if(!formOpen||!dirty)return;const h=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",h);return()=>window.removeEventListener("beforeunload",h);},[formOpen,dirty]);
  async function create(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy||!enabled)return;
    if([draft.signalKey,draft.productKey,draft.eventTerm,draft.detectionMethod].some(v=>!v.trim())||draft.reason.trim().length<10||!Number.isFinite(Date.parse(draft.detectedAt))){setMessage("Complete required fields, valid detection date and a reason of at least 10 characters.");return;}
    setBusy(true);setMessage("");
    try {
      const payload={...draft,sourceReference:draft.sourceReference||undefined,detectedAt:new Date(draft.detectedAt).toISOString()};
      const response=await fetch("/api/signals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||"Signal creation failed.");
      setDraft(initialDraft);setFormOpen(false);setMessage("Signal registered with the governed service.");await load();
    }catch(err){setMessage(err instanceof Error?err.message:"Signal creation failed.");}
    finally{setBusy(false);}
  }
  const cols:Column<Signal>[]=[
    {key:"key",header:"Signal",render:r=><Link href={`/signals/${encodeURIComponent(r.id)}`}>{r.signal_key}</Link>},
    {key:"product",header:"Product",render:r=>r.product_key},
    {key:"event",header:"Event",render:r=>r.event_term},
    {key:"method",header:"Method",render:r=>r.detection_method},
    {key:"source",header:"Source",render:r=>r.source_type.replaceAll("_"," ")},
    {key:"priority",header:"Priority",render:r=><Badge tone={r.priority==="CRITICAL"?"danger":r.priority==="HIGH"?"warning":"neutral"}>{r.priority}</Badge>},
    {key:"status",header:"Status",render:r=><Badge>{r.status.replaceAll("_"," ")}</Badge>},
    {key:"date",header:"Detected",render:r=>safeDate(r.detected_at)}
  ];
  return <div className={styles.panel}>
    <div className={styles.toolbar}>
      <strong>Scoped signal worklist</strong>
      <div className={styles.controls}>
        <Input aria-label="Search signal, product, event or source" placeholder="Search signals" value={query} onChange={e=>setQuery(e.target.value)}/>
        <Select aria-label="Status filter" value={status} onChange={e=>setStatus(e.target.value)} options={options(["DETECTED","VALIDATED","UNDER_EVALUATION","CONFIRMED","REFUTED","CLOSED"],"All statuses")}/>
        <Select aria-label="Detection method filter" value={method} onChange={e=>setMethod(e.target.value)} options={options(methods,"All methods")}/>
        <Select aria-label="Priority filter" value={priority} onChange={e=>setPriority(e.target.value)} options={options(["LOW","NORMAL","HIGH","CRITICAL"],"All priorities")}/>
        <Button type="button" variant="secondary" onClick={()=>void load()} disabled={loading}>Refresh</Button>
        {canCreate?<Button type="button" onClick={()=>{if(formOpen&&dirty&&!window.confirm("Discard unsaved signal registration?"))return;setFormOpen(v=>!v);}}>{formOpen?"Close form":"Register signal"}</Button>:null}
      </div>
    </div>
    {message?<Notice tone={message.includes("failed")?"error":"info"}>{message}</Notice>:null}
    {!enabled?<Notice tone="error">Signal Management entitlement is not available in the selected workspace.</Notice>:null}
    <DataGrid rows={filtered} columns={cols} rowKey={r=>r.id} loading={loading} error={error||undefined} onRetry={()=>void load()} emptyMessage="No signal records in the retrieved tenant/client scope match the filters."/>
    <p className={styles.muted}>Source-authorized list, maximum 500 records. Filters apply to the returned worklist; method-specific statistical detection is not available in this API.</p>
    {formOpen&&canCreate?<form className={styles.form} onSubmit={e=>void create(e)}>
      {([["signalKey","Signal key"],["productKey","Product key"],["eventTerm","Event term"],["detectionMethod","Detection method"]] as const).map(([key,label])=><label key={key}>{label}<Input required value={draft[key]} onChange={e=>setDraft(p=>({...p,[key]:e.target.value}))}/></label>)}
      <label>Source type<Select options={sources.map(v=>({value:v,label:v.replaceAll("_"," ")}))} value={draft.sourceType} onChange={e=>setDraft(p=>({...p,sourceType:e.target.value}))}/></label>
      <label>Priority<Select options={["LOW","NORMAL","HIGH","CRITICAL"].map(v=>({value:v,label:v}))} value={draft.priority} onChange={e=>setDraft(p=>({...p,priority:e.target.value}))}/></label>
      <label>Detected at<Input required type="datetime-local" value={draft.detectedAt} onChange={e=>setDraft(p=>({...p,detectedAt:e.target.value}))}/></label>
      <label>Source reference<Input value={draft.sourceReference} onChange={e=>setDraft(p=>({...p,sourceReference:e.target.value}))}/></label>
      <label className={styles.span}>Audit reason<textarea required minLength={10} value={draft.reason} onChange={e=>setDraft(p=>({...p,reason:e.target.value}))}/></label>
      <div className={styles.span}><Button type="submit" loading={busy}>Create governed signal</Button></div>
    </form>:null}
  </div>;
}
