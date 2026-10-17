"use client";
import { useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";
type Rule={id:string;title:string;statement:string;source_key?:string;domain?:string};
type Pack={id:string;version:string;status:string;rules:Rule[]};
type Managed={id:string;category:string;name:string;key:string;version:string;status:string;updatedAt:string};
type Payload={categories:{id:string;name:string;resourceTypes:readonly string[]}[];managedRecords:Managed[];packs:Pack[];sources:Record<string,{document:string;url:string}>;draftRuleCount:number;note:string};
const SECTIONS=["REGULATORY","CLINICAL","PRODUCT","CLIENT","TERMINOLOGY","DECISIONS","LITERATURE","GOVERNANCE","DRAFT_PACKS"];
export default function KnowledgeCentre(){
 const [data,setData]=useState<Payload|null>(null),[error,setError]=useState(""),[category,setCategory]=useState("REGULATORY"),[search,setSearch]=useState("");
 useEffect(()=>{const ctrl=new AbortController();void(async()=>{try{const r=await fetch("/api/admin/knowledge-centre",{cache:"no-store",signal:ctrl.signal});const j=await r.json();if(!r.ok||!j.success)throw new Error(j.error||"Knowledge Centre unavailable");setData(j.data);}catch(e){if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"Could not load knowledge");}})();return()=>ctrl.abort()},[]);
 const selected=data?.categories.find(x=>x.id===category);
 const records=useMemo(()=>data?.managedRecords.filter(x=>(selected?.resourceTypes||[]).includes(x.category)&&[x.name,x.category,x.key].join(" ").toLowerCase().includes(search.toLowerCase()))||[],[data,selected,search]);
 const rules=useMemo(()=>data?.packs.flatMap(p=>p.rules.map(r=>({...r,pack:p.id}))).filter(x=>[x.id,x.title,x.statement,x.pack].join(" ").toLowerCase().includes(search.toLowerCase()))||[],[data,search]);
 return <main style={{minHeight:"100vh",background:"#eef2f7",color:"#0f172a",padding:24}}>
  <Navigation/><InvestorDemoHeader eyebrow="SUPER USER ADMINISTRATION" title="Nexus Knowledge Centre" subtitle="One governed knowledge environment for PV modules and specialized AI agents." status="Controlled Knowledge" />
  {error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Loading controlled knowledge…</p>}
  {data&&<>
   <section style={{background:"#fff",padding:16,border:"1px solid #cbd5e1",borderRadius:6,marginBottom:14}}>
    <strong>{data.managedRecords.length} tenant-managed versions · {data.packs.length} draft packs · {data.draftRuleCount} draft controls</strong>
    <p style={{fontSize:12,color:"#92400e"}}>Draft rules are not approved, indexed into the live resolver, or authorized for autonomous clinical use. Existing configuration records retain their own lifecycle statuses.</p>
   </section>
   <div style={{display:"grid",gridTemplateColumns:"minmax(210px,265px) minmax(0,1fr)",gap:14}}>
    <nav aria-label="Knowledge categories" style={{display:"grid",gap:7,alignContent:"start"}}>
      {SECTIONS.map(id=><button type="button" key={id} onClick={()=>{setCategory(id);setSearch("");}} aria-current={category===id?"page":undefined} style={{textAlign:"left",padding:12,border:"1px solid #cbd5e1",borderRadius:5,color:"#0f172a",background:category===id?"#dbeafe":"white",fontWeight:600,cursor:"pointer"}}>{id==="DRAFT_PACKS"?"Agent Dependency View":data.categories.find(c=>c.id===id)?.name||id}</button>)}
    </nav>
    <section style={{background:"white",padding:18,borderRadius:6,border:"1px solid #cbd5e1"}}>
     <h2 style={{fontSize:20,marginTop:0}}>{category==="DRAFT_PACKS"?"Draft Agent Knowledge Dependencies":selected?.name}</h2>
     <label htmlFor="knowledge-query">Search this section</label>
     <input id="knowledge-query" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title, rule ID, product or category" style={{display:"block",width:"100%",padding:10,margin:"8px 0 14px",border:"1px solid #94a3b8",borderRadius:5}}/>
     {category==="DRAFT_PACKS"?<>{rules.map(rule=><article key={rule.pack+rule.id} style={{padding:12,borderTop:"1px solid #e2e8f0"}}><strong>{rule.id}: {rule.title}</strong><p>{rule.statement}</p><small style={{color:"#64748b"}}>{rule.pack} · DRAFT · Not activated</small>{rule.source_key&&data.sources[rule.source_key]&&<p><a href={data.sources[rule.source_key].url} target="_blank" rel="noopener noreferrer">Source candidate: {data.sources[rule.source_key].document}</a> · Exact clause unverified</p>}</article>)}</>:<>
       {records.map(record=><article key={record.id} style={{padding:12,borderTop:"1px solid #e2e8f0"}}><strong>{record.name}</strong><p>{record.category} · {record.key}</p><small>Version {record.version} · Status {record.status} · Updated {record.updatedAt}</small></article>)}
       {!records.length&&<p style={{color:"#64748b"}}>No matching controlled configuration records are available for this category. Additional Knowledge Base ingestion is pending.</p>}
      </>}
     <p style={{fontSize:12,marginTop:22,color:"#475569"}}>To manage currently supported controlled tenant configuration, use <a href="/admin/configuration">Configuration & Source Governance</a>. Review and clinical activation of draft rules are not available here.</p>
    </section>
   </div>
  </>}
 </main>
}
