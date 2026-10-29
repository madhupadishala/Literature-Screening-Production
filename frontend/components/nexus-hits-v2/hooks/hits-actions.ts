import type {Dispatch,SetStateAction} from "react";
import type {Hit} from "./useHits";
import {selfAssignHit} from "./hits-utils";
export function createChooseAction({menuRecord,queue,assigned,setAssigned,setMenuRecord,setNotice,openQueueRecord}:{menuRecord:string|null;queue:Hit[];assigned:string[];setAssigned:Dispatch<SetStateAction<string[]>>;setMenuRecord:(value:string|null)=>void;setNotice:(value:string)=>void;openQueueRecord:(id:string,mode:"readonly"|"review")=>void;}){
const chooseAction=async(action:"open"|"readonly"|"assign"|"review"|"accept")=>{
 if(!menuRecord)return;
 const hit=queue.find(x=>x.id===menuRecord);if(!hit)return;
 if(action==="readonly"||action==="open"){openQueueRecord(hit.id,"readonly");return;}
 if(!hit.packageId){setMenuRecord(null);setNotice("This is a synthetic preview record; no live ownership or review can be recorded.");return;}
 if(action==="review"&&!assigned.includes(hit.id)){setMenuRecord(null);setNotice("Accept the assignment or choose Accept and Review before editing.");return;}
 if(action==="assign"||action==="accept"){
  try{await selfAssignHit(hit.packageId);
  setAssigned(a=>a.includes(hit.id)?a:[...a,hit.id]);
  }catch(e){setMenuRecord(null);setNotice(e instanceof Error?e.message:"Self-assignment failed");return;}
 }
 if(action==="assign"){setMenuRecord(null);setNotice("Record assigned to your worklist.");return;}
 if(action==="review"||action==="accept"){openQueueRecord(hit.id,"review");}
};

return chooseAction;
}
