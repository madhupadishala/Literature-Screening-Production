"use client";
import type {ReactNode} from "react";
import type {useHits} from "./hooks/useHits";
import {Button} from "@/components/ui/Button";
import {Input} from "@/components/ui/Input";
import {Select} from "@/components/ui/Select";
import {DataTable} from "@/components/ui/DataTable";
export type HitsModel=ReturnType<typeof useHits>;
export type SharedRenderProps={model:HitsModel;parent:(key:string,title:string,children:ReactNode)=>ReactNode;child:(key:string,title:string,content:ReactNode)=>ReactNode;results:(kind:"dup"|"manual")=>ReactNode};

export function DuplicateCheck({model,parent,child,results}:SharedRenderProps){
const {query,setQuery,previewEnabled,run}=model;
return parent("dup","01 · Duplicate Check",<>{child("dupForm","1.1 Literature Duplicate Check",<div className="nh-fields"><label>Duplicate criteria<Input value={query.dup} onChange={e=>setQuery(q=>({...q,dup:e.target.value}))}/></label><Button disabled={!previewEnabled} onClick={()=>run("dup")}>Check Duplicate (preview)</Button></div>)}{child("dupResults","1.2 Literature Duplicate Results",results("dup"))}</>);
}
