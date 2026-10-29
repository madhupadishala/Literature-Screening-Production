import type {Dispatch,SetStateAction} from "react";
import type {Hit} from "./useHits";
import {saveHitsReview} from "./hits-utils";
import {useRecordLock} from "@/hooks/useRecordLock";
export function createSubmitHitsReview({activeQueueRecord,recordLock,reviewNotes,setNotice,setSavingReview,setSelection,setReviewNotes,loadHits}:{activeQueueRecord:Hit|null|undefined;recordLock:ReturnType<typeof useRecordLock>;reviewNotes:string;setNotice:(value:string)=>void;setSavingReview:(value:boolean)=>void;setSelection:Dispatch<SetStateAction<{kind:"dup"|"manual"|"queue";id:string}|null>>;setReviewNotes:(value:string)=>void;loadHits:()=>Promise<void>;}){
const submitHitsReview=async(status:"pending"|"approved"|"dismissed"|"flagged")=>{
 if(!activeQueueRecord?.packageId||!activeQueueRecord.hitsResultId)return;
 const proof=recordLock.getProof();if(!proof){setNotice("Record is read-only. Active edit lease required.");return;}
 if((status==="dismissed"||status==="flagged")&&reviewNotes.trim().length<3){setNotice("Please enter at least 3 characters of review rationale.");return;}
 setSavingReview(true);
 try{await saveHitsReview(activeQueueRecord,proof,status,reviewNotes);
 setNotice("Hits review saved with audit and edit-lease validation.");setSelection(null);setReviewNotes("");await loadHits();
 }catch(e){setNotice(e instanceof Error?e.message:"Review save failed");}
 finally{setSavingReview(false);}
};

return submitHitsReview;
}
