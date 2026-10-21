"use client";
import {useEffect,useRef,useState,useCallback} from "react";
export type LeaseProof={lock_token:string;fencing_token:string};
type Lease=LeaseProof & {expires_at:string};
export type LeaseState="idle"|"acquiring"|"editing"|"read_only"|"lost";
export function useRecordLock(recordId:string|null,stage:"SCREENING"|"MEDICAL_REVIEW",enabled:boolean){
 const [state,setState]=useState<LeaseState>("idle");
 const [message,setMessage]=useState("");
 const proofRef=useRef<Lease|null>(null);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!enabled||!recordId){setState("idle");proofRef.current=null;return;}
  const url=stage==="SCREENING"?`/api/v1/screening/records/${encodeURIComponent(recordId)}/lock`:`/api/v1/medical-review/records/${encodeURIComponent(recordId)}/lock`;
  let closed=false;
  let inFlight=false;
  let acquired:Lease|null=null;
  const release=(lease:Lease)=>{
    void fetch(url,{method:"DELETE",credentials:"same-origin",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({lock_token:lease.lock_token,fencing_token:lease.fencing_token})}).catch(()=>{});
  };
  setState("acquiring");setMessage("");
  void (async()=>{
   try{
    const res=await fetch(url,{method:"POST",credentials:"same-origin",cache:"no-store"});
    if(!res.ok){if(!closed){setState("read_only");setMessage(res.status===423?"Locked by another reviewer":"Editing unavailable — authorization or assignment required");}return;}
    const payload=await res.json() as {data:Lease};
    if(closed){release(payload.data);return;}
    acquired=payload.data;proofRef.current=payload.data;setRevision(n=>n+1);setState("editing");
   }catch{if(!closed){setState("read_only");setMessage("Could not acquire edit access");}}
  })();
  const timer=window.setInterval(async()=>{
   if(closed||inFlight||!acquired)return;
   inFlight=true;
   try{
    const res=await fetch(url,{method:"PATCH",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({lock_token:acquired.lock_token,fencing_token:acquired.fencing_token})});
    if(!res.ok)throw new Error("Renewal rejected");
    const payload=await res.json() as {data:{expires_at:string}};
    if(!closed&&acquired){acquired={...acquired,expires_at:payload.data.expires_at};proofRef.current=acquired;setRevision(n=>n+1);}
   }catch{if(!closed){acquired=null;proofRef.current=null;setState("lost");setMessage("Lease lost — editing is disabled. Reopen record to retry.");}}
   finally{inFlight=false;}
  },60000);
  const unload=()=>{if(acquired)release(acquired)};
  window.addEventListener("pagehide",unload);
  return()=>{closed=true;window.clearInterval(timer);window.removeEventListener("pagehide",unload);if(acquired)release(acquired);proofRef.current=null;};
 },[recordId,stage,enabled]);
 const getProof=useCallback(()=>{
  const p=proofRef.current;
  return state==="editing"&&p&&Date.parse(p.expires_at)>Date.now()?{lock_token:p.lock_token,fencing_token:p.fencing_token}:null;
 },[state,revision]);
 return {state,message,readOnly:state!=="editing",getProof};
}
