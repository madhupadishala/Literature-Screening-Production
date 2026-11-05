"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useWorkspaceContext} from "@/components/context/WorkspaceContext";
import {roleHasPermission,PERMISSIONS} from "@/lib/rbac/permissions";
import {PV_DOCUMENT_TYPES} from "@/lib/pv-documentation/pv-document-types";
import {DataGrid,type DataGridProps} from "@/components/ui/DataGrid";
import {Input} from "@/components/ui/Input";
import {Select} from "@/components/ui/Select";
import {Badge} from "@/components/ui/Badge";
import {Button} from "@/components/ui/Button";
import {Notice} from "@/components/ui/Notice";
import styles from "@/components/enterprise/GovernedWorkspace.module.css";

type Doc={id:string;document_key:string;document_type:string;title:string;lifecycle_status:string;current_version:number;updated_at:string};
type Draft={documentKey:string;documentType:string;title:string;reason:string};
const empty:Draft={documentKey:"",documentType:"SOP",title:"",reason:""};
const options=(values:string[],label:string)=>[{value:"",label},...values.map(v=>({value:v,label:v.replaceAll("_"," ")}))];
export default function PvDocumentLibrary(){
 const {state}=useWorkspaceContext();const c=state.context;
 const scope=c?[c.tenantId,c.workspaceId,c.environment,c.moduleKey].join(":"):"";
 const enabled=Boolean(c?.enabledModules.includes("PV_DOCUMENTATION"));
 const canCreate=Boolean(enabled&&c&&roleHasPermission(c.roleKey,PERMISSIONS.PV_DOCUMENT_CREATE));
 const request=useRef<AbortController|null>(null);
 const [rows,setRows]=useState<Doc[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [query,setQuery]=useState(""),[type,setType]=useState(""),[status,setStatus]=useState("");
 const [form,setForm]=useState(false),[draft,setDraft]=useState<Draft>(empty),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState("");
 const load=useCallback(async()=>{
  request.current?.abort();setRows([]);setError("");if(!scope||!enabled){setLoading(false);return;}
  const ctrl=new AbortController();request.current=ctrl;setLoading(true);
  try{const r=await fetch("/api/pv-documents?limit=500",{cache:"no-store",signal:ctrl.signal});const p=await r.json();
   if(!r.ok||!p.success||!Array.isArray(p.data?.records))throw new Error(p.error||"Document library unavailable.");
   if(!ctrl.signal.aborted)setRows(p.data.records);
  }catch(e){if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"Document library unavailable.");}
  finally{if(!ctrl.signal.aborted)setLoading(false);}
 },[scope,enabled]);
 useEffect(()=>{const t=window.setTimeout(()=>void load(),0);return()=>{clearTimeout(t);request.current?.abort();};},[load]);
 const statuses=useMemo(()=>[...new Set(rows.map(r=>r.lifecycle_status))].sort(),[rows]);
 const visible=useMemo(()=>rows.filter(r=>(!type||r.document_type===type)&&(!status||r.lifecycle_status===status)&&(!query.trim()||[r.document_key,r.document_type,r.title].some(v=>v.toLowerCase().includes(query.toLowerCase().trim())))),[rows,query,status,type]);
 const dirty=Object.keys(draft).some(k=>draft[k as keyof Draft]!==empty[k as keyof Draft]);
 useEffect(()=>{if(!form||!dirty)return;const h=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",h);return()=>window.removeEventListener("beforeunload",h);},[form,dirty]);
 async function create(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(!canCreate||busy)return;
  if(!draft.documentKey.trim()||!draft.title.trim()||draft.reason.trim().length<10){setFeedback("Document key, title and audit reason of ten characters or more are required.");return;}
  setBusy(true);setFeedback("");
  try{const r=await fetch("/api/pv-documents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(draft)});
   const p=await r.json();if(!r.ok||!p.success)throw new Error(p.error||"Document registration failed.");
   setDraft(empty);setForm(false);await load();setFeedback("Document registered in governed PV library.");
  }catch(err){setFeedback(err instanceof Error?err.message:"Registration failed.");}
  finally{setBusy(false);}
 }
 const columns:DataGridProps<Doc>["columns"]=[
  {key:"key",header:"Document",render:r=><Link href={`/pv-documents/${encodeURIComponent(r.id)}`}>{r.document_key}</Link>},
  {key:"title",header:"Title",render:r=>r.title},
  {key:"type",header:"Type",render:r=><Badge>{r.document_type.replaceAll("_"," ")}</Badge>},
  {key:"version",header:"Version",render:r=>`v${r.current_version}`},
  {key:"status",header:"Status",render:r=><Badge tone={r.lifecycle_status==="EFFECTIVE"?"success":"neutral"}>{r.lifecycle_status}</Badge>},
  {key:"updated",header:"Updated UTC",render:r=>r.updated_at?.slice(0,10)||"—"},
  {key:"action",header:"Open",render:r=><Link href={`/pv-documents/${encodeURIComponent(r.id)}`}>View history</Link>}
 ];
 return <div className={styles.panel}>
  <div className={styles.toolbar}><strong>PV document registry</strong><div className={styles.controls}>
   <Input aria-label="Search documents" placeholder="Title or document key" value={query} onChange={e=>setQuery(e.target.value)}/>
   <Select aria-label="Document type" options={options([...PV_DOCUMENT_TYPES],"All types")} value={type} onChange={e=>setType(e.target.value)}/>
   <Select aria-label="Lifecycle status" options={options(statuses,"All statuses")} value={status} onChange={e=>setStatus(e.target.value)}/>
   <Button variant="secondary" onClick={()=>void load()} disabled={loading}>Refresh</Button>
   {canCreate?<Button onClick={()=>{if(form&&dirty&&!window.confirm("Discard unsaved document registration?"))return;setForm(v=>!v);}}>{form?"Close":"Register document"}</Button>:null}
  </div></div>
  {!enabled?<Notice tone="error">PV Documentation is not enabled in the selected workspace.</Notice>:null}
  {feedback?<Notice>{feedback}</Notice>:null}
  <DataGrid rows={visible} columns={columns} rowKey={r=>r.id} loading={loading} error={error||undefined} onRetry={()=>void load()} emptyMessage="No governed PV documents match the current filters."/>
  <p className={styles.muted}>Registry results are bounded to 500 by the scoped API. File uploads, folder trees, signed annotations and certified redaction are not implemented by this endpoint.</p>
  {form&&canCreate?<form className={styles.form} onSubmit={e=>void create(e)}>
   <label>Document key<Input required value={draft.documentKey} onChange={e=>setDraft(p=>({...p,documentKey:e.target.value}))}/></label>
   <label>Document title<Input required value={draft.title} onChange={e=>setDraft(p=>({...p,title:e.target.value}))}/></label>
   <label>Type<Select options={PV_DOCUMENT_TYPES.map(v=>({value:v,label:v.replaceAll("_"," ")}))} value={draft.documentType} onChange={e=>setDraft(p=>({...p,documentType:e.target.value}))}/></label>
   <label className={styles.span}>Registration reason<textarea required minLength={10} value={draft.reason} onChange={e=>setDraft(p=>({...p,reason:e.target.value}))}/></label>
   <div className={styles.span}><Button type="submit" loading={busy}>Register governed document</Button></div>
  </form>:null}
 </div>;
}
