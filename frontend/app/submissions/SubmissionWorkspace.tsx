"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "./SubmissionWorkspace.module.css";
type Submission={id:string;case_id:string;destination_key:string;message_profile:string;status:string;updated_at:string};
export default function SubmissionWorkspace(){
 const [records,setRecords]=useState<Submission[]>([]);const [message,setMessage]=useState("Loading the active client workspace…");const [busy,setBusy]=useState<string>();
 const load=useCallback(async()=>{const response=await fetch("/api/submissions?limit=100",{cache:"no-store"});const payload=await response.json();if(!response.ok||!payload.success)throw new Error(payload.error??"Unable to load submissions.");setRecords(payload.data.records);setMessage(payload.data.records.length?"":"No submission packages exist in this client workspace.");},[]);
 useEffect(()=>{const timer=window.setTimeout(()=>{void load().catch((error:Error)=>setMessage(error.message));},0);return()=>window.clearTimeout(timer);},[load]);
 async function preflight(id:string){setBusy(id);setMessage("");try{const response=await fetch(`/api/submissions/${id}/preflight`,{method:"POST"});const payload=await response.json();if(!response.ok||!payload.success)throw new Error(payload.error??"Preflight failed.");const report=payload.data.report;setMessage(`Preflight ${report.readiness}: ${report.findings.length} finding(s). Evidence was recorded.`);}catch(error){setMessage(error instanceof Error?error.message:"Preflight failed.");}finally{setBusy(undefined);}}
 return <section className={styles.workspace} aria-label="ICSR submissions worklist">
  <div className={styles.notice} role="status"><strong>Authority transmission is locked</strong><span>Packages can be prepared and qualified; delivery remains disabled until authority onboarding and validation are approved.</span></div>
  <div className={styles.toolbar}><div><strong>Submission worklist</strong><span>{records.length} scoped package(s)</span></div><button type="button" onClick={()=>void load().catch((error:Error)=>setMessage(error.message))}>Refresh</button></div>
  {message?<p className={styles.message}>{message}</p>:null}
  <div className={styles.tableWrap}><table><thead><tr><th>Case</th><th>Destination</th><th>Profile</th><th>Status</th><th>Updated</th><th>Qualification</th></tr></thead><tbody>{records.map(item=><tr key={item.id}><td><code>{item.case_id.slice(0,12)}</code></td><td>{item.destination_key}</td><td>{item.message_profile}</td><td><span className={styles.status}>{item.status}</span></td><td>{new Date(item.updated_at).toLocaleString()}</td><td><button type="button" disabled={busy===item.id} onClick={()=>void preflight(item.id)}>{busy===item.id?"Running…":"Run preflight"}</button></td></tr>)}</tbody></table></div>
 </section>;
}
