"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useWorkspaceContext} from "@/components/context/WorkspaceContext";
import {roleHasPermission,PERMISSIONS} from "@/lib/rbac/permissions";
import {Button} from "@/components/ui/Button";
import {Select} from "@/components/ui/Select";
import {Input} from "@/components/ui/Input";
import {Tabs} from "@/components/ui/Tabs";
import {Card} from "@/components/ui/Card";
import {Notice} from "@/components/ui/Notice";
import {EvidencePanel} from "@/components/ui/EvidencePanel";
import styles from "@/components/enterprise/GovernedWorkspace.module.css";

type Json=Record<string,unknown>;
const dict=(v:unknown):Json=>v&&typeof v==="object"&&!Array.isArray(v)?v as Json:{};
const describe=(v:unknown)=>typeof v==="string"||typeof v==="number"?String(v):"—";
const legal:Record<string,string[]>={DRAFT:["DRAFT","REVIEWED"],IN_REVIEW:["REVIEWED","APPROVED"],APPROVED:["EFFECTIVE","RETIRED"],EFFECTIVE:["RETIRED"],RETIRED:[]};
export default function PvDocumentDetail({id}:{id:string}){
 const {state}=useWorkspaceContext();const c=state.context;
 const scope=c?[c.tenantId,c.workspaceId,c.environment,c.moduleKey].join(":"):"";
 const enabled=Boolean(c?.enabledModules.includes("PV_DOCUMENTATION"));
 const canReview=Boolean(enabled&&c&&roleHasPermission(c.roleKey,PERMISSIONS.PV_DOCUMENT_REVIEW));
 const canApprove=Boolean(enabled&&c&&roleHasPermission(c.roleKey,PERMISSIONS.PV_DOCUMENT_APPROVE));
 const active=useRef<AbortController|null>(null);
 const [data,setData]=useState<Json|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [content,setContent]=useState("{}"),[saved,setSaved]=useState("{}"),[linkedSources,setLinkedSources]=useState("[]"),[savedSources,setSavedSources]=useState("[]");
 const [versionStatus,setVersionStatus]=useState("DRAFT"),[reason,setReason]=useState("");
 const [effectiveFrom,setEffectiveFrom]=useState(""),[effectiveUntil,setEffectiveUntil]=useState("");
 const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState("");
 const load=useCallback(async()=>{
  active.current?.abort();setData(null);setError("");if(!scope||!enabled){setLoading(false);return;}
  const ctrl=new AbortController();active.current=ctrl;setLoading(true);
  try{const res=await fetch(`/api/pv-documents/${encodeURIComponent(id)}`,{cache:"no-store",signal:ctrl.signal});const body=await res.json();
   if(!res.ok||!body.success||!body.data)throw new Error(body.error||"PV document unavailable.");
   if(ctrl.signal.aborted)return;
   const doc=dict(body.data);setData(doc);
   const v=Array.isArray(doc.versions)?doc.versions.map(dict):[];
   const last=v.at(-1);const text=JSON.stringify(dict(last?.content),null,2);setContent(text);setSaved(text);
   const sources=JSON.stringify(Array.isArray(last?.linked_sources)?last.linked_sources:[],null,2);setLinkedSources(sources);setSavedSources(sources);
  }catch(e){if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"PV document unavailable.");}
  finally{if(!ctrl.signal.aborted)setLoading(false);}
 },[id,scope,enabled]);
 useEffect(()=>{const t=window.setTimeout(()=>void load(),0);return()=>{clearTimeout(t);active.current?.abort();};},[load]);
 const history=useMemo(()=>Array.isArray(data?.versions)?data.versions.map(dict):[],[data]);
 const status=describe(data?.lifecycle_status);
 const allowed=legal[status]??[];
 const readonly=status==="RETIRED";
 const dirty=content!==saved||reason.trim()!==""||linkedSources!==savedSources;
 useEffect(()=>{if(!dirty)return;const h=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",h);return()=>window.removeEventListener("beforeunload",h);},[dirty]);
 async function save(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy||readonly||!enabled)return;
  const elevated=["APPROVED","EFFECTIVE","RETIRED"].includes(versionStatus);
  if((elevated&&!canApprove)||(!elevated&&!canReview)){setFeedback("The selected transition is not authorized for this role.");return;}
  if(reason.trim().length<10){setFeedback("Change reason must contain at least ten characters.");return;}
  let parsed:unknown,linked:unknown;
  try{parsed=JSON.parse(content);linked=JSON.parse(linkedSources);if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||!Array.isArray(linked)||linked.some(x=>!x||typeof x!=="object"||Array.isArray(x)))throw Error();}
  catch{setFeedback("Content must be an object and linked sources must be an array of objects.");return;}
  if(versionStatus==="EFFECTIVE"&&!effectiveFrom){setFeedback("An effective date is required.");return;}
  if(effectiveFrom&&effectiveUntil&&effectiveUntil<effectiveFrom){setFeedback("Effective end date cannot precede the start.");return;}
  setBusy(true);setFeedback("");
  try{const res=await fetch(`/api/pv-documents/${encodeURIComponent(id)}/versions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({versionStatus,content:parsed,linkedSources:linked,changeReason:reason,effectiveFrom:effectiveFrom||undefined,effectiveUntil:effectiveUntil||undefined})});
   const result=await res.json();if(!res.ok||!result.success)throw new Error(result.error||"PV version save failed.");
   await load();setReason("");setFeedback("Governed document version recorded.");
  }catch(err){setFeedback(err instanceof Error?err.message:"PV version save failed.");}
  finally{setBusy(false);}
 }
 if(!enabled)return <Notice tone="error">PV Documentation is unavailable in this workspace.</Notice>;
 if(loading)return <p role="status">Loading document history…</p>;
 if(error)return <Notice tone="error">{error}<Button onClick={()=>void load()}>Retry</Button></Notice>;
 if(!data)return <Notice>PV document not found.</Notice>;
 return <div className={styles.panel}>
  <div className={styles.toolbar}><Link href="/pv-documents">PV document library</Link><strong>{describe(data.document_key)} · {describe(data.title)}</strong><span>{status}</span></div>
  {feedback?<Notice>{feedback}</Notice>:null}
  <Tabs items={[
   {id:"content",label:"Version editor",content:<div className={styles.panel}>
    <EvidencePanel suggestion="No automated document approval is configured." source="Versioned content and linked-source records in scoped PV Documentation service." decision="Only a qualified human reviewer/approver may record review or effective state." finalized={readonly}/>
    <form className={styles.form} onSubmit={e=>void save(e)}>
     <label className={styles.span}>Version content (JSON)<textarea rows={12} required disabled={readonly} value={content} onChange={e=>setContent(e.target.value)}/></label>
     <label className={styles.span}>Linked sources (JSON array)<textarea rows={4} disabled={readonly} value={linkedSources} onChange={e=>setLinkedSources(e.target.value)}/></label>
     <label>Target lifecycle stage<Select disabled={readonly} options={allowed.map(v=>({value:v,label:v}))} value={allowed.includes(versionStatus)?versionStatus:""} onChange={e=>setVersionStatus(e.target.value)}/></label>
     <label>Effective from<Input type="date" disabled={readonly} value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)}/></label>
     <label>Effective until<Input type="date" disabled={readonly} min={effectiveFrom||undefined} value={effectiveUntil} onChange={e=>setEffectiveUntil(e.target.value)}/></label>
     <label className={styles.span}>Version reason<textarea minLength={10} required disabled={readonly} value={reason} onChange={e=>setReason(e.target.value)}/></label>
     <div className={styles.span}><Button type="submit" disabled={readonly||!allowed.length||(versionStatus?["APPROVED","EFFECTIVE","RETIRED"].includes(versionStatus)?!canApprove:!canReview:true)} loading={busy}>Save governed version</Button></div>
    </form>
   </div>},
   {id:"history",label:"Immutable versions",content:<div className={styles.panel}>{history.length?history.map((v,i)=><Card key={String(v.id??i)}>
    <strong>v{describe(v.version)} · {describe(v.version_status)}</strong><p>{describe(v.change_reason)}</p>
    <small>Hash: {describe(v.content_sha256)} · Effective: {describe(v.effective_from)} — {describe(v.effective_until)}</small>
    <pre className={styles.pre}>{JSON.stringify(v.content??{},null,2)}</pre>
   </Card>):<p>No versions recorded.</p>}</div>},
   {id:"limitations",label:"Document governance",content:<Notice>The API supports controlled JSON content versions, source links and lifecycle transitions. It does not provide binary uploads, PDF rendering, true electronic signatures, redaction burn-in, visual annotations, watermarking, or a certified 21 CFR Part 11 signature workflow.</Notice>}
  ]}/>
 </div>;
}
