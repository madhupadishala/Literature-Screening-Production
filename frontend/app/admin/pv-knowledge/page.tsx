"use client";

import { useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";

type Rule = { id: string; title: string; statement: string; approval_state: string; source_key?: string; source_section?: string; domain?: string };
type Pack = { id: string; version: string; status: string; rules: Rule[] };
type Payload = { packs: Pack[]; sources: Record<string, { authority: string; document: string; url: string; citation_scope: string }>; status: string; liveKnowledgeResolverConnected: boolean; agentClinicalUseAuthorized: boolean };

export default function PvKnowledgeCentrePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/admin/pv-knowledge", { signal: controller.signal, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || "Access denied or knowledge unavailable.");
        setData(payload.data as Payload);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Knowledge unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);
  const pack = data?.packs.find((entry) => entry.id === selected) ?? data?.packs[0];
  const rules = useMemo(() => (pack?.rules ?? []).filter((r) => [r.id,r.title,r.statement,r.domain].join(" ").toLowerCase().includes(filter.toLowerCase())), [pack,filter]);
  return <main style={{ minHeight: "100vh", background: "#eef2f7", padding: 24, color: "#0f172a" }}>
    <Navigation />
    <InvestorDemoHeader eyebrow="CENTRALIZED NEXUS KNOWLEDGE GOVERNANCE" title="Nexus Knowledge Centre" subtitle="Read-only draft clinical and regulatory decision controls. No rule is approved or enabled for autonomous agent decisions." status="Review Pending" />
    {loading && <p role="status">Loading knowledge packs…</p>}
    {error && <p role="alert" style={{color:"#991b1b"}}>{error}</p>}
    {data && <>
      <section style={{background:"#fff", border:"1px solid #cbd5e1", borderRadius:8, padding:18, marginBottom:16}}>
        <strong>{data.packs.length} topic packs · {data.packs.reduce((n,p) => n+p.rules.length,0)} draft controls</strong>
        <p style={{color:"#92400e"}}>Unapproved working knowledge. Live Knowledge Resolver: NOT CONNECTED. Autonomous clinical use: BLOCKED.</p>
        <p style={{color:"#475569"}}>Review the wording, source applicability, and missing coverage. Formal PV/QA review and approval require a separate governed workflow.</p>
      </section>
      <div style={{display:"grid",gridTemplateColumns:"minmax(200px,260px) minmax(0,1fr)",gap:14,alignItems:"start"}}>
        <nav aria-label="Knowledge topic packs" style={{display:"grid",gap:6}}>
          {data.packs.map((p) => <button key={p.id} type="button" onClick={() => {setSelected(p.id);setFilter("");}} aria-current={pack?.id===p.id?"page":undefined} style={{padding:12,textAlign:"left",background:pack?.id===p.id?"#dbeafe":"#fff",border:"1px solid #cbd5e1",borderRadius:6,color:"#0f172a",cursor:"pointer"}}><strong>{p.id}</strong><br/><small>{p.rules.length} draft controls · {p.version}</small></button>)}
        </nav>
        <section style={{background:"#fff",border:"1px solid #cbd5e1",borderRadius:8,padding:18}}>
          <h2 style={{fontSize:20,marginTop:0}}>{pack?.id}</h2>
          <p style={{color:"#92400e"}}>Status: {pack?.status} — Review only</p>
          <label htmlFor="rule-search" style={{display:"block",marginBottom:6}}>Find rules in this pack</label>
          <input id="rule-search" value={filter} onChange={(e)=>setFilter(e.target.value)} placeholder="Search rule ID, wording or domain" style={{width:"100%",padding:10,border:"1px solid #94a3b8",borderRadius:5,marginBottom:12}}/>
          {rules.map((rule)=><article key={rule.id} style={{borderTop:"1px solid #e2e8f0",padding:"14px 0"}}>
            <strong>{rule.id} — {rule.title}</strong>
            <p>{rule.statement}</p>
            <small style={{color:"#64748b"}}>Status: DRAFT · {rule.domain ?? "Shared control"}</small>
            {rule.source_key && <p style={{fontSize:12}}>Source candidate: {data.sources[rule.source_key]?.document ?? rule.source_key}. Exact regulatory section not yet verified. {data.sources[rule.source_key]?.url && <a href={data.sources[rule.source_key].url} target="_blank" rel="noopener noreferrer">Open source</a>}</p>}
          </article>)}
          {!rules.length && <p>No matching draft rules.</p>}
        </section>
      </div>
    </>}
  </main>;
}
