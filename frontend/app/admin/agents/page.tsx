"use client";

import { useState } from "react";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";

const missing = new Set([7, 16, 25, 27]);
const agentNames = [
  "Drug Extraction and Classification", "Adverse Event Extraction", "Patient Identifier",
  "Reporter Identifier", "Indication Identifier", "Medical History", "Laboratory Data",
  "Country of Incident", "Clock Start Date", "Translation", "Seriousness Assessment",
  "Labeling / Listedness", "Causality", "Dechallenge", "Rechallenge", "AESI / AOAC",
  "Safety Information", "Literature Duplicate Check", "ICSR Duplicate Check",
  "Narrative Writing", "Follow-up Questionnaire", "Inclusion / Exclusion",
  "Action Taken", "History Capture", "Additional Specialist (source unavailable)",
  "MedDRA / Specialized Coding", "Additional Specialist (source unavailable)",
];

export default function NexusAgentWorkspace() {
  const [documentId, setDocumentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [output, setOutput] = useState<unknown>(null);

  async function runAG01() {
    setBusy(true);
    setMessage("");
    setOutput(null);
    try {
      const response = await fetch("/api/safety/intake/ag01", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({documentId: documentId.trim()}),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const issue = data && typeof data === "object" && "error" in data ? String(data.error) : "Agent execution unavailable";
        throw new Error(issue);
      }
      setOutput(data);
      setMessage("AG01 returned a result. Human review is required.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Agent execution failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell" id="main-content">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="NEXUS SHARED AGENTS"
        title="Agent Workspace"
        subtitle="Explore the 27 canonical agent slots. Only agents with a connected executable workflow can be run; source presence alone is not availability."
        status="Controlled test workspace"
      />
      <section style={{padding:20,background:"#fff",border:"1px solid #cbd5e1",marginBottom:20}}>
        <h2>AG01 — Drug Extraction</h2>
        <p>Uses your authenticated Nexus Intake context and an existing authorized plain-text source document. Switch to the Intake workspace before running.</p>
        <label htmlFor="ag01-document">Stored source document UUID</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
          <input id="ag01-document" value={documentId} onChange={e=>setDocumentId(e.target.value)}
            placeholder="Document UUID" style={{minWidth:320,padding:10,border:"1px solid #94a3b8"}} />
          <button type="button" disabled={busy || !/^[0-9a-f-]{36}$/i.test(documentId.trim())}
            onClick={()=>void runAG01()} style={{padding:"10px 18px",background:"#0f172a",color:"#fff"}}>
            {busy ? "Running…" : "Run AG01"}
          </button>
        </div>
        {message && <p role="status">{message}</p>}
        {output !== null && <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:440,overflow:"auto"}}>{JSON.stringify(output,null,2)}</pre>}
        <p><Link href="/intake">Open Intake</Link></p>
      </section>
      <section aria-label="Canonical agents" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
        {agentNames.map((name,index)=>{
          const id = `AG${String(index+1).padStart(2,"0")}`;
          const status = missing.has(index+1) ? "Source unavailable" : index===0 ? "Execution route implemented; deployment unverified" : "Source present; execution not connected";
          return <article key={id} style={{padding:16,background:"#fff",border:"1px solid #cbd5e1"}}>
            <strong>{id} — {name}</strong>
            <p style={{fontSize:13}}>{status}</p>
          </article>;
        })}
      </section>
    </main>
  );
}
