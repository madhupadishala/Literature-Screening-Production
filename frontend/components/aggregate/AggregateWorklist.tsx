"use client";

import Link from "next/link";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useWorkspaceContext} from "@/components/context/WorkspaceContext";
import {roleHasPermission,PERMISSIONS} from "@/lib/rbac/permissions";
import {DataGrid} from "@/components/ui/DataGrid";
import type {Column} from "@/components/ui/DataTable";
import {Button} from "@/components/ui/Button";
import {Input} from "@/components/ui/Input";
import {Select} from "@/components/ui/Select";
import {Badge} from "@/components/ui/Badge";
import {Notice} from "@/components/ui/Notice";
import {validAggregatePeriod} from "@/lib/nexus/wave3-client-contract";
import AggregatePeriodCalendar from "@/components/aggregate/AggregatePeriodCalendar";
import styles from "@/components/enterprise/GovernedWorkspace.module.css";

type Report={id:string;report_key:string;report_type:string;product_key:string|null;period_start:string;period_end:string;status:string;updated_at:string};
type Draft={reportKey:string;reportType:string;productKey:string;periodStart:string;periodEnd:string;reason:string};
const empty:Draft={reportKey:"",reportType:"PSUR_PBRER",productKey:"",periodStart:"",periodEnd:"",reason:""};
const types=["PSUR_PBRER","DSUR","PADER","LINE_LISTING","CUSTOM"];
const opts=(values:string[],label:string)=>[{value:"",label},...values.map(x=>({value:x,label:x.replaceAll("_"," ")}))];
export default function AggregateWorklist(){
 const {state}=useWorkspaceContext();const ctx=state.context;
 const scope=ctx?[ctx.tenantId,ctx.workspaceId,ctx.environment,ctx.moduleKey].join(":"):"";
 const enabled=Boolean(ctx?.enabledModules.includes("AGGREGATE_REPORTING"));
 const canCreate=enabled&&Boolean(ctx&&roleHasPermission(ctx.roleKey,PERMISSIONS.AGGREGATE_CREATE));
 const active=useRef<AbortController|null>(null);
 const [rows,setRows]=useState<Report[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 const [query,setQuery]=useState("");const [status,setStatus]=useState("");const [kind,setKind]=useState("");
 const [calendarOpen,setCalendarOpen]=useState(false);
 const [open,setOpen]=useState(false);const [draft,setDraft]=useState<Draft>(empty);const [busy,setBusy]=useState(false);const [feedback,setFeedback]=useState("");
 const load=useCallback(async()=>{
   active.current?.abort();setRows([]);setError("");
   if(!scope||!enabled){setLoading(false);return;}
   const req=new AbortController();active.current=req;setLoading(true);
   try{const res=await fetch("/api/aggregate-reports?limit=500",{cache:"no-store",signal:req.signal});const payload=await res.json();
     if(!res.ok||!payload.success||!Array.isArray(payload.data?.records))throw new Error(payload.error||"Aggregate report worklist unavailable.");
     if(!req.signal.aborted)setRows(payload.data.records);
   }catch(err){if(!req.signal.aborted)setError(err instanceof Error?err.message:"Aggregate report worklist unavailable.");}
   finally{if(!req.signal.aborted)setLoading(false);}
 },[scope,enabled]);
 useEffect(()=>{const t=window.setTimeout(()=>void load(),0);return()=>{clearTimeout(t);active.current?.abort();};},[load]);
 const statuses=useMemo(()=>[...new Set(rows.map(x=>x.status))].sort(),[rows]);
 const visible=useMemo(()=>rows.filter(x=>(!kind||x.report_type===kind)&&(!status||x.status===status)&&(!query.trim()||[x.report_key,x.product_key||"",x.report_type,x.status].some(v=>v.toLowerCase().includes(query.toLowerCase().trim())))),[rows,kind,status,query]);
 const dirty=Object.keys(draft).some(k=>draft[k as keyof Draft]!==empty[k as keyof Draft]);
 useEffect(()=>{if(!dirty||!open)return;const h=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",h);return()=>window.removeEventListener("beforeunload",h);},[dirty,open]);
 async function create(e:React.FormEvent<HTMLFormElement>){
   e.preventDefault();if(busy||!enabled)return;
   if(!draft.reportKey.trim()||!validAggregatePeriod(draft.periodStart,draft.periodEnd)||draft.reason.trim().length<10){setFeedback("Report key, chronological period and reason of at least ten characters are required.");return;}
   setBusy(true);setFeedback("");
   try{const res=await fetch("/api/aggregate-reports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...draft,productKey:draft.productKey.trim()||undefined})});
    const payload=await res.json();if(!res.ok||!payload.success)throw new Error(payload.error||"Report registration failed.");
    setDraft(empty);setOpen(false);setFeedback("Governed aggregate report created; source snapshot recorded.");await load();
   }catch(err){setFeedback(err instanceof Error?err.message:"Report creation failed.");}
   finally{setBusy(false);}
 }
 const columns:Column<Report>[]=[
   {key:"key",header:"Report",render:r=><Link href={`/aggregate-reports/${encodeURIComponent(r.id)}`}>{r.report_key}</Link>},
   {key:"type",header:"Type",render:r=><Badge>{r.report_type.replaceAll("_"," ")}</Badge>},
   {key:"product",header:"Product",render:r=>r.product_key||"All scoped"},
   {key:"period",header:"Reporting period",render:r=><span>{r.period_start.slice(0,10)} – {r.period_end.slice(0,10)}</span>},
   {key:"status",header:"Status",render:r=><Badge tone={r.status==="FINALIZED"?"success":"neutral"}>{r.status.replaceAll("_"," ")}</Badge>},
   {key:"action",header:"Action",render:r=><Link href={`/aggregate-reports/${encodeURIComponent(r.id)}`}>Open report</Link>}
 ];
 return <div className={styles.panel}>
  <div className={styles.toolbar}><strong>Aggregate reporting tracker</strong>
   <div className={styles.controls}>
    <Input aria-label="Search reports" placeholder="Report / product" value={query} onChange={e=>setQuery(e.target.value)}/>
    <Select aria-label="Report type filter" value={kind} options={opts(types,"All types")} onChange={e=>setKind(e.target.value)}/>
    <Select aria-label="Report status filter" value={status} options={opts(statuses,"All statuses")} onChange={e=>setStatus(e.target.value)}/>
    <Button variant="secondary" onClick={()=>void load()} disabled={loading}>Refresh</Button>
    {canCreate?<Button onClick={()=>setOpen(v=>!v)}>{open?"Close form":"Create aggregate"}</Button>:null}
   </div>
  </div>
  {!enabled?<Notice tone="error">Aggregate Reporting is not enabled in the selected workspace.</Notice>:null}
  {feedback?<Notice>{feedback}</Notice>:null}
  <DataGrid rows={visible} columns={columns} rowKey={r=>r.id} loading={loading} error={error||undefined} onRetry={()=>void load()} emptyMessage="No aggregate reports match these filters in the scoped response."/>
  {calendarOpen?<AggregatePeriodCalendar reports={rows}/>:null}
  <p className={styles.muted}>Limited to 500 reports by the current API. Only PSUR/PBRER, DSUR, PADER, line listing and custom record types are supported by this service.</p>
  {open&&canCreate?<form className={styles.form} onSubmit={e=>void create(e)}>
    <label>Report key<Input required value={draft.reportKey} onChange={e=>setDraft(p=>({...p,reportKey:e.target.value}))}/></label>
    <label>Report type<Select value={draft.reportType} onChange={e=>setDraft(p=>({...p,reportType:e.target.value}))} options={types.map(v=>({value:v,label:v.replaceAll("_"," ")}))}/></label>
    <label>Product key<Input value={draft.productKey} onChange={e=>setDraft(p=>({...p,productKey:e.target.value}))}/></label>
    <label>Period start<Input required type="date" value={draft.periodStart} onChange={e=>setDraft(p=>({...p,periodStart:e.target.value}))}/></label>
    <label>Period end<Input required type="date" min={draft.periodStart||undefined} value={draft.periodEnd} onChange={e=>setDraft(p=>({...p,periodEnd:e.target.value}))}/></label>
    <label className={styles.span}>Creation reason<textarea minLength={10} required value={draft.reason} onChange={e=>setDraft(p=>({...p,reason:e.target.value}))}/></label>
    <div className={styles.span}><Button type="submit" loading={busy}>Create governed report</Button></div>
  </form>:null}
 </div>;
}
