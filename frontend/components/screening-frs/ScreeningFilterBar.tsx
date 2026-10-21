"use client";
import { useState } from "react";

export type ScreeningFilters = {
  coi: string; product: string; event: string; seriousness: string;
  causality: string; listedness: string; susar: string; database: string;
  from: string; to: string;
};
export const EMPTY_SCREENING_FILTERS: ScreeningFilters = {
  coi:"",product:"",event:"",seriousness:"",causality:"",
  listedness:"",susar:"",database:"",from:"",to:""
};
export type FilterableScreeningRecord = {
  country_of_interest?: string; product_name?: string;
  clinical_events?: string[]; seriousness?: string;
  causality?: string; listedness?: string; susar?: string;
  origin_database?: string; date_received?: string;
};
function normal(value: string): string {
  return value.toLowerCase().normalize("NFKC").trim().replace(/\s+/g," ");
}
function editDistance(a:string,b:string):number {
  const prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++) {
    let last=i-1, left=i;
    for(let j=1;j<=b.length;j++) {
      const previous=prev[j];
      const next=Math.min(previous+1,left+1,last+(a[i-1]===b[j-1]?0:1));
      prev[j]=next;last=previous;left=next;
    }
  }
  return prev[b.length];
}
/** Partial and % wildcard matching. Fuzzy matches are suggestions only. */
export function matchesText(actual:string, entered:string):boolean {
  const value=normal(actual), query=normal(entered);
  if(!query) return true;
  if(query.includes("%")){
    const expression="^"+query.split("%").map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join(".*")+"$";
    return new RegExp(expression,"u").test(value);
  }
  return value.includes(query);
}
export function closeMatch(actual:string,entered:string):boolean {
  const query=normal(entered);
  if(query.length<5||query.includes("%")) return false;
  return normal(actual).split(/\s+/).some(word=>Math.abs(word.length-query.length)<=2&&editDistance(word,query)<=2);
}
export function matchesScreeningFilters(record:FilterableScreeningRecord,filters:ScreeningFilters):boolean {
  const text=(key:keyof FilterableScreeningRecord)=> {
    const v=record[key];return Array.isArray(v)?v.join(" "):String(v??"");
  };
  const fields:[keyof ScreeningFilters,keyof FilterableScreeningRecord][]=[
    ["coi","country_of_interest"],["product","product_name"],["event","clinical_events"],
    ["seriousness","seriousness"],["causality","causality"],["listedness","listedness"],
    ["susar","susar"],["database","origin_database"]
  ];
  if(!fields.every(([field,key])=>matchesText(text(key),filters[field]))) return false;
  const received=record.date_received?.slice(0,10)||"";
  if(filters.from&&(!received||received<filters.from))return false;
  if(filters.to&&(!received||received>filters.to))return false;
  return true;
}
const CONFIG:[keyof ScreeningFilters,string][]=[
  ["coi","COI"],["product","Product / INN"],["event","Events"],
  ["seriousness","Seriousness"],["causality","Causality"],
  ["listedness","Listedness"],["susar","SUSAR"],
  ["database","Origin database"],["from","Received from"],["to","Received to"]
];
type Props={value:ScreeningFilters;onChange:(v:ScreeningFilters)=>void;
  loadedCount:number;matchingCount:number;limitations:string};
export default function ScreeningFilterBar({value,onChange,loadedCount,matchingCount,limitations}:Props){
  const [open,setOpen]=useState(false);
  const active=Object.values(value).filter(Boolean).length;
  const update=(key:keyof ScreeningFilters,next:string)=>onChange({...value,[key]:next});
  return <section className="nxs-filter" aria-label="Screening filters">
    <div className="nxs-filter-bar">
      <button type="button" className="nxs-filter-trigger" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-controls="nxs-filter-fields">Filters {active?"("+active+")":""} {open?"▴":"▾"}</button>
      <span className="nxs-filter-summary">{active?"Combined criteria active":"No criteria · newest records first"} · {matchingCount} of {loadedCount} loaded records</span>
      <button type="button" onClick={()=>onChange({...EMPTY_SCREENING_FILTERS})}>Clear all</button>
    </div>
    {open&&<div id="nxs-filter-fields" className="nxs-filter-fields">
      {CONFIG.map(([key,label])=><label key={key}>{label}<input
        type={key==="from"||key==="to"?"date":"text"}
        value={value[key]}
        onChange={e=>update(key,e.target.value)}
        placeholder="Optional · text / % wildcard"
        aria-label={label}
      /></label>)}
      <p className="nxs-filter-help">All fields optional. Criteria combine using AND. Text supports case-insensitive partial terms and % wildcards. Spelling suggestions are not automatically applied.</p>
    </div>}
    <small className="nxs-data-limit">{limitations}</small>
    <style jsx>{`
      .nxs-filter{border:1px solid #c6c6c6;background:#fff;margin:4px 0}
      .nxs-filter-bar{display:flex;gap:10px;align-items:center;min-height:37px;padding:4px 8px}
      .nxs-filter-bar button{border:1px solid #8d8d8d;background:#fff;color:#161616;font-size:11px;padding:5px 10px;cursor:pointer}
      .nxs-filter-bar .nxs-filter-trigger{background:#0f62fe;color:white;border-color:#0f62fe;font-weight:700}
      .nxs-filter-summary{flex:1;font-size:11px;color:#525252}
      .nxs-filter-fields{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;padding:10px;border-top:1px solid #e0e0e0}
      .nxs-filter-fields label{display:flex;flex-direction:column;gap:3px;font-size:10px;color:#525252;font-weight:700}
      .nxs-filter-fields input{width:100%;min-width:0;background:#f4f4f4;border:0;border-bottom:1px solid #8d8d8d;border-radius:0;padding:7px;font:inherit;font-weight:400;color:#161616}
      .nxs-filter-help{grid-column:1/-1;color:#525252;font-size:10px;margin:0}
      .nxs-data-limit{display:block;color:#6f6f6f;padding:0 8px 4px;font-size:9px}
      @media(max-width:900px){.nxs-filter-fields{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:540px){.nxs-filter-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `}</style>
  </section>;
}
