import type {Hit} from "./useHits";
export async function fetchLiveHits():Promise<Hit[]>{
const res=await fetch("/api/literature/hits?limit=500",{cache:"no-store"});if(!res.ok)throw new Error("Hits API unavailable");const payload=await res.json();const items=payload?.data?.hits;if(!Array.isArray(items))throw new Error("Invalid Hits response");const records:Hit[]=items.map((v:Record<string,unknown>)=>({id:String(v.hit_id||v.package_id),database:"Literature",doi:String(v.doi||""),pmid:String(v.pmid||""),title:String(v.title||""),language:"—",primary:"—",secondary:"",country:String(v.country_of_interest||"—"),seriousness:String(v.patient_safety_status||"Not assessed"),product:String(v.product_name||"—"),events:"—",articleType:"—",fullText:false,safety:String(v.patient_safety_status||"").toUpperCase()==="POSITIVE",evidence:String(v.evidence_sentence||""),listedness:"Not assessed",relatedness:"Not assessed",susar:"Not assessed",date:String(v.publication_date||""),packageId:String(v.database_package_id||""),hitsResultId:String(v.hits_result_id||""),reviewVersion:Number(v.review_version||0)}));
return records;
}
export function downloadHitsCsv(filtered:Hit[]):void{
const safe=(value:unknown)=>{const raw=String(value??"");return '"'+(/^[=+@\\-\\t\\r]/.test(raw)?"'"+raw:raw).replace(/"/g,'""')+'"';};const columns=["ID","Database","DOI","PMID","Title","Language","Primary reporter","Secondary reporter","Country","Seriousness","Product","Events","Article type","Full text"];const data=filtered.map(x=>[x.id,x.database,x.doi,x.pmid,x.title,x.language,x.primary,x.secondary,x.country,x.seriousness,x.product,x.events,x.articleType,x.fullText?"Yes":"No"]);const csv="\\uFEFF"+[columns,...data].map(row=>row.map(safe).join(",")).join("\\r\\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="hits-queue-preview.csv";link.click();URL.revokeObjectURL(url);
}

export async function selfAssignHit(packageId:string):Promise<void>{
const res=await fetch("/api/v1/hits/self-assign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({record_id:packageId})});
const payload=await res.json();
if(!res.ok||!payload.success)throw new Error(payload.error?.message||payload.error?.code||"Assignment refused");
}
export async function saveHitsReview(hit:Hit,proof:Record<string,unknown>,status:"pending"|"approved"|"dismissed"|"flagged",reviewNotes:string):Promise<void>{
const res=await fetch("/api/literature/hits/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({packageId:hit.packageId,hitsResultId:hit.hitsResultId,status,comments:reviewNotes,expectedVersion:hit.reviewVersion??0,...proof})});
const data=await res.json();
if(!res.ok||!data.success)throw new Error(data.error?.message||"Save failed");
}
