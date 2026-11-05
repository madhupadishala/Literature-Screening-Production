"use client";
import {useMemo,useState} from "react";
import {Button} from "@/components/ui/Button";
import {Badge} from "@/components/ui/Badge";
import styles from "./AggregatePeriodCalendar.module.css";

export type CalendarReport={id:string;report_key:string;report_type:string;period_end:string;status:string};
function validDate(v:string){return /^\d{4}-\d{2}-\d{2}/.test(v)&&Number.isFinite(Date.parse(v));}
function ical(text:string){return text.replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/[,;]/g,m=>"\\"+m);}
function addOneDay(date:string){const x=new Date(date+"T00:00:00Z");x.setUTCDate(x.getUTCDate()+1);return x.toISOString().slice(0,10);}
export function calendarIcs(reports:readonly CalendarReport[]){
 const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//TheClinixAI//NEXUS Aggregate Reporting//EN","CALSCALE:GREGORIAN"];
 for(const r of reports){
  if(!validDate(r.period_end))continue;
  const date=r.period_end.slice(0,10),next=addOneDay(date);
  lines.push("BEGIN:VEVENT",`UID:aggregate-${ical(r.id)}@nexus.local`,`DTSTART;VALUE=DATE:${date.replaceAll("-","")}`,`DTEND;VALUE=DATE:${next.replaceAll("-","")}`,`SUMMARY:${ical(r.report_type+" period end — "+r.report_key)}`,`DESCRIPTION:${ical("Reporting period end only. NOT a regulatory submission deadline. Status: "+r.status)}`,"END:VEVENT");
 }
 lines.push("END:VCALENDAR");
 return lines.join("\r\n")+"\r\n";
}
export default function AggregatePeriodCalendar({reports}:{reports:CalendarReport[]}){
 const today=new Date();
 const [year,setYear]=useState(today.getFullYear()),[month,setMonth]=useState(today.getMonth());
 const first=new Date(Date.UTC(year,month,1));
 const offset=(first.getUTCDay()+6)%7;
 const days=new Date(Date.UTC(year,month+1,0)).getUTCDate();
 const entries=useMemo(()=>{
  const map=new Map<number,CalendarReport[]>();
  for(const r of reports){if(!validDate(r.period_end))continue;const day=r.period_end.slice(0,10);
   if(Number(day.slice(0,4))!==year||Number(day.slice(5,7))!==month+1)continue;
   const n=Number(day.slice(8,10));map.set(n,[...(map.get(n)??[]),r]);
  }
  return map;
 },[reports,year,month]);
 const cells=Array.from({length:Math.ceil((offset+days)/7)*7},(_,idx)=>idx-offset+1);
 function move(delta:number){const d=new Date(Date.UTC(year,month+delta,1));setYear(d.getUTCFullYear());setMonth(d.getUTCMonth());}
 function exportIcs(){
  const blob=new Blob([calendarIcs(reports)],{type:"text/calendar;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");link.href=url;link.download="nexus-aggregate-period-ends.ics";link.click();
  URL.revokeObjectURL(url);
 }
 return <section className={styles.root} aria-label="Aggregate reporting period calendar">
  <header className={styles.heading}>
   <strong>Reporting period ends — not regulatory deadlines</strong>
   <div className={styles.actions}>
    <Button variant="secondary" onClick={()=>move(-1)} aria-label="Previous month">Previous</Button>
    <span aria-live="polite">{new Intl.DateTimeFormat("en-GB",{month:"long",year:"numeric",timeZone:"UTC"}).format(first)}</span>
    <Button variant="secondary" onClick={()=>move(1)} aria-label="Next month">Next</Button>
    <Button variant="secondary" onClick={exportIcs}>Export ICS</Button>
   </div>
  </header>
  <div className={styles.grid} role="grid" aria-label="Period end dates">
   {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><strong key={d} className={styles.week}>{d}</strong>)}
   {cells.map((day,i)=><div key={i} className={styles.day} role="gridcell">
    {day>0&&day<=days?<><span>{day}</span>{(entries.get(day)??[]).map(r=><a key={r.id} href={`/aggregate-reports/${encodeURIComponent(r.id)}`} title={r.report_key}><Badge>{r.report_type}</Badge><small>{r.report_key}</small></a>)}</>:null}
   </div>)}
  </div>
 </section>;
}
