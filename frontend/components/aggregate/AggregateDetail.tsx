"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useWorkspaceContext} from "@/components/context/WorkspaceContext";
import {Tabs} from "@/components/ui/Tabs";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";
import {Select} from "@/components/ui/Select";
import {Notice} from "@/components/ui/Notice";
import {EvidencePanel} from "@/components/ui/EvidencePanel";
import styles from "@/components/enterprise/GovernedWorkspace.module.css";

type Json=Record<string,unknown>;
const sections=["introduction","actions_taken","exposure","safety_data","signals","literature","benefit_risk","conclusion","appendices"] as const;
type Section=(typeof sections)[number];
const label=(s:string)=>s.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
const initialContent=Object.fromEntries(sections.map(s=>[s,""])) as Record<Section,string>;
function record(v:unknown):Json {return v&&typeof v==="object"&&!Array.isArray(v)?v as Json:{};}
function pretty(v:unknown):string {return JSON.stringify(v??{},null,2);}
export default function AggregateDetail({id}:{id:string}){
 const {state}=useWorkspaceContext();const ctx=state.context;
 const scope=ctx?[ctx.tenantId,ctx.workspaceId,ctx.environment,ctx.moduleKey].join(":"):"";
 const enabled=Boolean(ctx?.enabledModules.includes("AGGREGATE_REPORTING"));
 const active=useRef<AbortController|null>(null);
 const [data,setData]=useState<Json|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 const [content,setContent]=useState<Record<Section,string>>(initialContent);
 const [saved,setSaved]=useState<Record<Section,string>>(initialContent);
 const [status,setStatus]=useState("DRAFT");const [reason,setReason]=useState("");
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 const load=useCallback(async()=>{
   active.current?.abort();setData(null);setError("");
   if(!scope||!enabled){setLoading(false);return;}
   const ctrl=new AbortController();active.current=ctrl;setLoading(true);
   try{
     const response=await fetch(`/api/aggregate-reports/${encodeURIComponent(id)}`,{cache:"no-store",signal:ctrl.signal});
     const payload=await response.json();
     if(!response.ok||!payload.success||!payload.data)throw new Error(payload.error||"Report could not be retrieved.");
     if(ctrl.signal.aborted)return;
     const report=record(payload.data);setData(report);
     const versions=Array.isArray(report.versions)?report.versions.map(record):[];
     const last=versions.at(-1);const savedContent=record(last?.content);
     const mapped={...initialContent};
     for(const key of sections){const value=savedContent[key];mapped[key]=typeof value==="string"?value:"";}
     setContent(mapped);setSaved(mapped);
   }catch(err){if(!ctrl.signal.aborted)setError(err instanceof Error?err.message:"Report unavailable.");}
   finally{if(!ctrl.signal.aborted)setLoading(false);}
 },[id,scope,enabled]);
 useEffect(()=>{const t=window.setTimeout(()=>void load(),0);return()=>{clearTimeout(t);active.current?.abort();};},[load]);
 const versions=useMemo(()=>Array.isArray(data?.versions)?data.versions.map(record):[],[data]);
 const dirty=sections.some(key=>saved[key]!==content[key]);
 useEffect(()=>{if(!dirty)return;const onLeave=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",onLeave);return()=>window.removeEventListener("beforeunload",onLeave);},[dirty]);
 const finalized=data?.status==="FINALIZED";
 async function save(e:React.FormEvent<HTMLFormElement>){
   e.preventDefault();if(busy||finalized||!enabled)return;
   if(reason.trim().length<10){setMessage("Change reason must have at least ten characters.");return;}
   setBusy(true);setMessage("");
   try{
     const latest=versions.at(-1);const previous=record(latest?.content);
     const response=await fetch(`/api/aggregate-reports/${encodeURIComponent(id)}/versions`,{
       method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({content:{...previous,...content},status,changeReason:reason})
     });
     const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||"Version save failed.");
     await load();setReason("");setStatus("DRAFT");setMessage("Governed aggregate version recorded.");
   }catch(err){setMessage(err instanceof Error?err.message:"Version save failed.");}
   finally{setBusy(false);}
 }
 if(!enabled)return <Notice tone="error">Aggregate Reporting entitlement is not available in the active workspace.</Notice>;
 if(loading)return <p role="status">Loading governed aggregate report…</p>;
 if(error)return <Notice tone="error">{error} <Button onClick={()=>void load()}>Retry</Button></Notice>;
 if(!data)return <Notice>Report not found.</Notice>;
 const snapshot=record(data.source_snapshot);
 return <div className={styles.panel}>
  <div className={styles.toolbar}><Link href="/aggregate-reports">Aggregate tracker</Link><strong>{String(data.report_key??"Report")}</strong><span>{String(data.status??"—")}</span></div>
  {message?<Notice>{message}</Notice>:null}
  <Tabs items={[
   {id:"author",label:"Sectioned authoring",content:<div className={styles.panel}>
     <Notice>Regulated aggregate report authoring: the source snapshot is retained by the server. Text must be reviewed and approved by an authorized human before finalization.</Notice>
     <form className={styles.form} onSubmit={e=>void save(e)}>
       {sections.map(key=><label className={styles.span} key={key}>{label(key)}
        <textarea disabled={finalized} value={content[key]} onChange={e=>setContent(p=>({...p,[key]:e.target.value}))}/>
       </label>)}
       <label>Review state<Select disabled={finalized} value={status} onChange={e=>setStatus(e.target.value)} options={["DRAFT","REVIEWED","APPROVED","FINALIZED"].map(v=>({value:v,label:v}))}/></label>
       <label className={styles.span}>Version reason<textarea disabled={finalized} required minLength={10} value={reason} onChange={e=>setReason(e.target.value)}/></label>
       {!finalized?<div className={styles.span}><Button type="submit" loading={busy}>{status==="FINALIZED"?"Finalize governed version":"Save new governed version"}</Button></div>:<p className={styles.muted}>Finalized record is immutable.</p>}
     </form>
   </div>},
   {id:"evidence",label:"Frozen source evidence",content:<div className={styles.panel}>
     <EvidencePanel suggestion="No AI-authored benefit-risk conclusion has been verified by this reporting API." source="Server-frozen case-version snapshot and SHA-256 provenance." decision="Medical and benefit-risk conclusions require human review." finalized={finalized}/>
     <Card><strong>Frozen source snapshot</strong><pre className={styles.pre}>{pretty(snapshot)}</pre></Card>
     <Card><strong>Source SHA-256</strong><p>{String(data.source_sha256??"Not provided")}</p></Card>
   </div>},
   {id:"history",label:"Versions and approvals",content:<div className={styles.panel}>
     {versions.length?versions.map((v,i)=><Card key={String(v.id??i)}>
       <strong>Version {String(v.version??i+1)} · {String(v.status??"—")}</strong>
       <p>{String(v.change_reason??"No reason recorded")}</p>
       <small>{String(v.created_at??"")} · {String(v.created_by??"")}</small>
       <pre className={styles.pre}>{pretty(v.content)}</pre>
     </Card>):<p>No authored versions recorded.</p>}
   </div>},
   {id:"package",label:"Package readiness",content:<div className={styles.panel}>
     <Notice>The backend stores source snapshots and governed content versions. Certified PDF, EU PSUR XML, ICH E2C XML, submission dispatch and authority template management are not implemented by this API.</Notice>
     <p className={styles.muted}>Do not treat the current report version as an approved regulatory submission package.</p>
   </div>}
  ]}/>
 </div>;
}
