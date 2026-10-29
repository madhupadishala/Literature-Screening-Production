"use client";
import type {ReactNode} from "react";
import "./hits-workspace.css";
import {useHits} from "./hooks/useHits";
import {DuplicateCheck} from "./DuplicateCheck";
import {ManualSearch} from "./ManualSearch";
import {Queue} from "./Queue";
import {MyAssignments} from "./MyAssignments";
import {Section} from "@/components/ui/Section";
import {Notice} from "@/components/ui/Notice";
import {Badge} from "@/components/ui/Badge";
import {DataTable} from "@/components/ui/DataTable";
import {Select} from "@/components/ui/Select";
import {Button} from "@/components/ui/Button";
import {EvidencePanel} from "@/components/ui/EvidencePanel";
export default function HitsWorkspace(){
const model=useHits();
const {loadError,previewEnabled,queue,completed,rereview,assigned,notice,setNotice,rows,setSelection,setReviewNotes,setAddTarget,open,menuRecord,setMenuRecord,chooseAction,selection,selected,viewMode,row,reviewNotes,recordLock,savingReview,submitHitsReview,decide,addTarget,reason,setReason,add,audit}=model;
const options=(values:string[],v:string,change:(x:string)=>void)=><Select value={v} onChange={e=>change(e.target.value)} options={[{value:"",label:"All"},...values.map(x=>({value:x,label:x}))]}/>;
const results=(kind:"dup"|"manual")=><DataTable rows={rows[kind]} rowKey={r=>r.hit.id} emptyMessage="No preview records — run a fixture-only search" columns={[
{key:"origin",header:"Origin",render:r=>r.hit.database},
{key:"doi",header:"DOI",render:r=>r.hit.doi},
{key:"pmid",header:"PMID / ID",render:r=>r.hit.pmid},
{key:"title",header:"Title",render:r=>r.hit.title},
{key:"country",header:"COI",render:r=>r.hit.country},
{key:"seriousness",header:"Seriousness",render:r=>r.hit.seriousness},
{key:"duplicate",header:"Duplicate",render:r=>r.match?"Yes — "+r.match:"No exact fixture match"},
{key:"action",header:"Actions",render:r=><><Button variant="secondary" onClick={()=>{setSelection({kind,id:r.hit.id});setReviewNotes("");}}>Review fixture</Button><Button variant="secondary" disabled={r.decision!=="No"||!!r.match} onClick={()=>setAddTarget({kind,id:r.hit.id})}>Add to preview</Button></>}
]}/>;
const child=(key:string,title:string,content:ReactNode)=><Section title={title}>{content}</Section>;
const parent=(key:string,title:string,children:React.ReactNode)=><Section title={title}>{children}</Section>;
return <div className="nh-root">{loadError&&<Notice tone="error">{loadError}</Notice>}{previewEnabled&&<Badge tone="warning">PREVIEW FIXTURES — NOT LIVE SEARCH</Badge>}<div className="nh-metrics" aria-label="Hits insights"><div>Hits in queue<strong>{queue.length}</strong></div><div>Awaiting review<strong>{queue.length-completed.length}</strong></div><div>Preview re-review<strong>{previewEnabled?rereview.length:0}</strong></div><div>Assignments<strong>{assigned.length}</strong></div></div>{notice&&<div role="status" className="nh-notice">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
<DuplicateCheck model={model} parent={parent} child={child} results={results}/>
<ManualSearch model={model} parent={parent} child={child} results={results}/>
<Queue model={model} options={options}/>
<MyAssignments model={model}/>
<details className="nh-audit"><summary>Preview activity history ({audit.length})</summary>{audit.map((a,i)=><p key={i}>{a}</p>)}</details><p className="nh-disclaimer">Live queue review and assignments use server APIs and edit leases. Duplicate/manual search is a separately labeled preview-only fixture when explicitly enabled.</p>
{menuRecord&&<div className="nh-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setMenuRecord(null)}}><div className="nh-action-menu" role="dialog" aria-modal="true" aria-label="Hits record actions"><header><strong>Record actions · {menuRecord}</strong><button type="button" onClick={()=>setMenuRecord(null)} aria-label="Close actions">×</button></header><div className="nh-action-list"><button type="button" onClick={()=>chooseAction("open")}>Open</button><button type="button" onClick={()=>chooseAction("readonly")}>Open read-only</button><button type="button" onClick={()=>void chooseAction("assign")} disabled={!queue.find(x=>x.id===menuRecord)?.packageId}>Self-assign</button><button type="button" onClick={()=>void chooseAction("review")} disabled={!queue.find(x=>x.id===menuRecord)?.packageId}>Review</button><button type="button" onClick={()=>void chooseAction("accept")} disabled={!queue.find(x=>x.id===menuRecord)?.packageId}>Accept and Review</button></div><p>Live records require assignment and an exclusive edit lease. Synthetic records remain read-only.</p></div></div>}
{selection&&selected&&<div className="nh-overlay"><aside className="nh-drawer" role="dialog" aria-modal="true"><header><h2>{selection.kind==="queue"?"Hits Record":"Duplicate Review"} — {selected.id}</h2><button onClick={()=>setSelection(null)} aria-label="Close">×</button></header><div className="nh-details"><h3>{selected.title}</h3>{selection.kind==="queue"&&<EvidencePanel suggestion="No AI determination made in this workspace" source={selected.evidence||"No evidence available"} decision={viewMode==="review"?"Awaiting human review":"Read-only record"} />}{Object.entries(selected).map(([key,value])=><p key={key}><b>{key}:</b> {String(value)}</p>)}{row?.match&&<p className="nh-warning">Existing record: {row.match}. Cannot add again.</p>}{(selection.kind!=="queue"||viewMode==="review")&&<label>Review rationale / notes<textarea value={reviewNotes} onChange={e=>setReviewNotes(e.target.value)} disabled={selection.kind==="queue"&&recordLock.readOnly}/></label>}</div><footer>{selection.kind==="queue"?(viewMode==="readonly"?<span>Read-only record view</span>:<><span>{recordLock.readOnly?(recordLock.message||"Acquiring an exclusive edit lease…"):"Exclusive edit lease active"}</span><button type="button" disabled={recordLock.readOnly||savingReview} onClick={()=>void submitHitsReview("approved")}>Approve Hits</button><button type="button" disabled={recordLock.readOnly||savingReview} onClick={()=>void submitHitsReview("flagged")}>Flag for review</button><button type="button" disabled={recordLock.readOnly||savingReview} onClick={()=>void submitHitsReview("dismissed")}>Dismiss</button></>):<><button onClick={()=>decide("Yes")}>Yes — Duplicate</button><button disabled={!!row?.match} onClick={()=>decide("No")}>No — Not duplicate</button><button onClick={()=>decide("Re-review")}>Re-review</button></>}</footer></aside></div>}
{addTarget&&<div className="nh-overlay"><div className="nh-modal" role="dialog" aria-modal="true"><h2>Preview Add to Hits Queue</h2><label>Mandatory reason<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label><button onClick={()=>setAddTarget(null)}>Cancel</button><button disabled={!reason.trim()} onClick={add}>Confirm Add (mock)</button></div></div>}</div>;
}
