'use client';
import Link from 'next/link';
import { useState } from 'react';
export default function COIPage(){
 const [text,setText]=useState('');const [module,setModule]=useState('literature');const [result,setResult]=useState<unknown>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function run(){setBusy(true);setError('');setResult(null);try{
  const segments=[];for(let start=0;start<text.length;start+=6000)segments.push({id:`text-${start}`,text:text.slice(start,start+6500),locator:`source text characters ${start}-${Math.min(start+6500,text.length)}`});
  const r=await fetch('/api/ai/coi',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({module,segments})});const data=await r.json();if(!r.ok)throw new Error(data.error?.message||data.error||data.message||'Extraction unavailable');setResult(data.data);
 }catch(e){setError(e instanceof Error?e.message:'Extraction unavailable');}finally{setBusy(false);}}
 return <main style={{maxWidth:900,margin:'40px auto',padding:24}}>
  <Link href="/">Back to Nexus</Link><h1>Country of Incident</h1>
  <p>Paste the complete readable source text. The agent identifies where each patient experienced each event and provides evidence for review. Sign in and select the relevant Nexus workspace first.</p>
  <p>All suggestions require PV review. Scanned documents need verified text extraction before use.</p>
  <label htmlFor="coi-module">Module </label><select id="coi-module" value={module} onChange={e=>setModule(e.target.value)}><option value="literature">Literature</option><option value="intake">Intake</option><option value="case_processing">Case Processing</option></select>
  <p><label htmlFor="coi-source">Source document text</label></p>
  <textarea id="coi-source" value={text} onChange={e=>setText(e.target.value)} maxLength={48000} rows={16} style={{width:'100%',border:'1px solid #777',padding:12}} />
  <p>{text.length.toLocaleString()} / 48,000 characters</p>
  <button disabled={busy||!text.trim()} onClick={run} style={{padding:'10px 20px',background:'#1761a0',color:'white'}}>{busy?'Extracting…':'Extract country of incident'}</button>
  {error&&<p role="alert">{error}</p>}
  {result!==null&&<section aria-live="polite"><h2>Review results</h2><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(result,null,2)}</pre></section>}
 </main>;
}
