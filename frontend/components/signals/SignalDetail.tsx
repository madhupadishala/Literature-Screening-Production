"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceContext } from "@/components/context/WorkspaceContext";
import { roleHasPermission, PERMISSIONS } from "@/lib/rbac/permissions";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Notice } from "@/components/ui/Notice";
import { EvidencePanel } from "@/components/ui/EvidencePanel";
import { Badge } from "@/components/ui/Badge";
import { allowedSignalTransitions, isSignalApprovalTransition } from "@/lib/nexus/wave3-client-contract";
import styles from "@/components/enterprise/GovernedWorkspace.module.css";

type Signal = Record<string, unknown> & {assessments?: Array<Record<string, unknown>>};
type Assessment = "VALIDATION"|"PRIORITIZATION"|"EVALUATION"|"RECOMMENDATION"|"CLOSURE";
const asText=(x:unknown)=>x===null||x===undefined?"—":typeof x==="string"||typeof x==="number"?String(x):"—";
const meaningful=(x:unknown)=>typeof x==="string"&&x.trim()?x:"—";
export default function SignalDetail({id}:{id:string}) {
  const {state}=useWorkspaceContext();const context=state.context;
  const scope=context?[context.tenantId,context.workspaceId,context.environment,context.moduleKey].join(":"):"";
  const authorized=Boolean(context?.enabledModules.includes("SIGNAL_MANAGEMENT"));
  const canAssess=Boolean(context&&roleHasPermission(context.roleKey,PERMISSIONS.SIGNAL_ASSESS));
  const canApprove=Boolean(context&&roleHasPermission(context.roleKey,PERMISSIONS.SIGNAL_APPROVE));
  const controller=useRef<AbortController|null>(null);
  const [data,setData]=useState<Signal|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [assessmentType,setAssessmentType]=useState<Assessment>("VALIDATION");
  const [outcome,setOutcome]=useState("");
  const [rationale,setRationale]=useState("");
  const [nextStatus,setNextStatus]=useState("");
  const [evidence,setEvidence]=useState("{}");
  const load=useCallback(async()=>{
    controller.current?.abort();setData(null);setError("");
    if(!scope||!authorized){setLoading(false);return;}
    const req=new AbortController();controller.current=req;setLoading(true);
    try{
      const response=await fetch(`/api/signals/${encodeURIComponent(id)}`,{cache:"no-store",signal:req.signal});
      const payload=await response.json();
      if(!response.ok||!payload.success||!payload.data)throw new Error(payload.error||"Unable to retrieve governed signal.");
      if(!req.signal.aborted)setData(payload.data);
    }catch(e){if(!req.signal.aborted)setError(e instanceof Error?e.message:"Signal unavailable.");}
    finally{if(!req.signal.aborted)setLoading(false);}
  },[id,scope,authorized]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);controller.current?.abort();};},[load]);
  const status=asText(data?.status);
  const allowed=allowedSignalTransitions(status);
  const dirty=Boolean(outcome||rationale||nextStatus||evidence!=="{}");
  useEffect(()=>{if(!dirty)return;const handler=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[dirty]);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||!authorized||!data||!canAssess||(nextStatus&&isSignalApprovalTransition(nextStatus)&&!canApprove))return;
    if(!outcome.trim()||rationale.trim().length<10){setMessage("Provide an outcome and source-supported rationale of at least 10 characters.");return;}
    let parsed:unknown;
    try{parsed=JSON.parse(evidence);if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")throw new Error("Evidence must be an object.");}
    catch{setMessage("Evidence must be a valid JSON object.");return;}
    setBusy(true);setMessage("");
    try{
      const response=await fetch(`/api/signals/${encodeURIComponent(id)}/assessments`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({assessmentType,outcome,rationale,evidence:parsed,nextStatus:nextStatus||undefined})
      });
      const payload=await response.json();
      if(!response.ok||!payload.success)throw new Error(payload.error||"Assessment failed.");
      setOutcome("");setRationale("");setNextStatus("");setEvidence("{}");
      await load();setMessage("Human assessment saved in governed signal history.");
    }catch(err){setMessage(err instanceof Error?err.message:"Assessment failed.");}
    finally{setBusy(false);}
  }
  const snapshot=data?.detection_snapshot;
  const assessments=Array.isArray(data?.assessments)?data.assessments:[];
  const info=useMemo(()=>data?Object.entries(data).filter(([k,v])=>!["assessments","detection_snapshot"].includes(k)&&["string","number"].includes(typeof v)):[],[data]);
  if(!authorized)return <Notice tone="error">Signal Management entitlement is not available in this workspace.</Notice>;
  if(loading)return <p role="status">Loading governed signal evidence…</p>;
  if(error)return <Notice tone="error">{error} <Button onClick={()=>void load()}>Retry</Button></Notice>;
  if(!data)return <Notice>No signal record available.</Notice>;
  return <div className={styles.panel}>
    <div className={styles.toolbar}>
      <div><Link href="/signals">Signal worklist</Link> / <strong>{meaningful(data.signal_key)}</strong></div>
      <Badge tone={status==="CLOSED"?"success":"info"}>{status.replaceAll("_"," ")}</Badge>
    </div>
    {message?<Notice tone={message.includes("saved")?"success":"error"}>{message}</Notice>:null}
    <Tabs items={[
      {id:"evidence",label:"Evidence",content:<div className={styles.panel}>
        <EvidencePanel suggestion="Automated signal classification is not enabled by the existing Signal API." source="Recorded detection snapshot, provenance and source reference." decision="Clinical interpretation and causality require a qualified human reviewer."/>
        <div className={styles.grid}>{info.map(([k,v])=><dl className={styles.keyvalue} key={k}><dt>{k.replaceAll("_"," ")}</dt><dd>{asText(v)}</dd></dl>)}</div>
        <Card><strong>Detection evidence snapshot</strong><pre className={styles.pre}>{JSON.stringify(snapshot??{},null,2)}</pre></Card>
        <p className={styles.muted}>PRR/ROR/IC plots, case-series visualization, geography and population analyses require verified source datasets or detection services. None are fabricated here.</p>
      </div>},
      {id:"assess",label:"Human assessment",content:<form className={styles.form} onSubmit={e=>void submit(e)}>
        <label>Assessment stage<Select value={assessmentType} onChange={e=>setAssessmentType(e.target.value as Assessment)} options={["VALIDATION","PRIORITIZATION","EVALUATION","RECOMMENDATION","CLOSURE"].map(x=>({value:x,label:x.replaceAll("_"," ")}))}/></label>
        <label>Authorized transition<Select value={nextStatus} onChange={e=>setNextStatus(e.target.value)} options={[{value:"",label:"Record without transition"},...allowed.map(x=>({value:x,label:x.replaceAll("_"," ")}))]}/></label>
        <label>Assessment outcome<Input required value={outcome} onChange={e=>setOutcome(e.target.value)}/></label>
        <label className={styles.span}>Clinical rationale<textarea required minLength={10} value={rationale} onChange={e=>setRationale(e.target.value)}/></label>
        <label className={styles.span}>Evidence JSON<textarea value={evidence} onChange={e=>setEvidence(e.target.value)}/></label>
        <div className={styles.span}><Button disabled={busy||status==="CLOSED"||!canAssess||(Boolean(nextStatus)&&isSignalApprovalTransition(nextStatus)&&!canApprove)} loading={busy} type="submit">Record governed assessment</Button></div>
        {status==="CLOSED"?<p className={styles.muted}>Closed signal: further workflow transitions are unavailable.</p>:null}
      </form>},
      {id:"timeline",label:"Decision history",content:<div className={styles.panel}>{assessments.length?assessments.map((item,i)=><Card key={String(item.id??i)}>
        <strong>{asText(item.assessment_type)} · Version {asText(item.assessment_version)}</strong>
        <p>{asText(item.outcome)}</p><p>{asText(item.rationale)}</p>
        <small>Next status: {asText(item.next_status)} · Reviewer: {asText(item.assessed_by)} · {asText(item.created_at)}</small>
      </Card>):<p>No assessments have been recorded.</p>}</div>}
    ]}/>
  </div>;
}
