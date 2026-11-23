import {expect,it} from "vitest";
import {createEvalNatlang} from "./evalNatlang.js";
import {fakeRpc,testNewFunction} from "./testSupport.js";

function fixture(exportName="default", params: any[]=[{name:"value",type:"number"},{name:"label",type:"string",optional:true}]) {
  const files:Record<string,string>={"skills/replay/entry.ts":'export default function entry(value:number,label?:string):string{return (label??"default")+value;} export function other(value:number):number{return value*3;} export function collect(prefix:string,...values:number[]):string{return prefix+values.join(",");}'};
  let reads=0;
  const recorded={definition:{site:"named",source:"entry.ts",id:`ts:entry.ts#${exportName}`,name:"display-name-is-not-an-export",params},program_root:"skills/replay",inputs:{value:{complete:true,hash:"input"}}};
  const values:Record<string,string>={input:"7",prefix:JSON.stringify("p:"),rest:"[1,2,3]"};
  const {rpc,calls}=fakeRpc({records:{getCall:()=>({record:recorded}),getValue:(input)=>values[input.hash]!}});
  const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:"user",objectKey:"reference-replay"},bindings:{rpc,fs:{
    stat:async (path:string)=>({isDirectory:()=>!Object.hasOwn(files,path)}),
    readdir:async()=>Object.keys(files).map(path=>({name:path.split("/").at(-1)!,isDirectory:()=>false})),
    readFile:async(path:string)=>{reads++;return files[path]!;},
  }}});
  const rerun=(options={})=>runtime.runCell(()=> (runtime.ambient.natlang as any).rerun("old-call",options),{runId:"new-reference-call",signal:new AbortController().signal});
  return {runtime,rerun,calls,recorded,values,reads:()=>reads};
}

it("reruns the exact recorded TS default export with omitted optional inputs",async()=>{
  const f=fixture();try{
    const result=await f.rerun();expect(result.value).toBe("default7");
    const recorded=f.calls.filter(call=>call.method==="record").map(call=>(call.args[0] as any).record);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].definition.id).toBe("ts:entry.ts#default");
    expect(recorded[0].executor.kind).toBe("crisp");
  }finally{f.runtime.close();}
});
it("reruns a named TS export by identity, without guessing its display name",async()=>{
  const f=fixture("other",[{name:"value",type:"number"}]);try{expect((await f.rerun()).value).toBe(21);}finally{f.runtime.close();}
});
it("rejects model overrides for crisp TS before loading or invoking",async()=>{
  const f=fixture();try{await expect(f.rerun({model:"test:executor-small"})).rejects.toThrow(/crisp code.*no model override/);expect(f.reads()).toBe(0);}finally{f.runtime.close();}
});
it("does not guess missing export identities or missing required inputs",async()=>{
  const f=fixture();try{
    f.recorded.definition.id="ts:foreign.ts#default";
    await expect(f.rerun()).rejects.toThrow(/exact recorded export identity/);
    f.recorded.definition.id="ts:entry.ts#missing";
    await expect(f.rerun()).rejects.toThrow(/not callable/);
    f.recorded.definition.id="ts:entry.ts#default";
    f.recorded.definition.params[1]!.optional=false;
    await expect(f.rerun()).rejects.toThrow(/no input label/);
  }finally{f.runtime.close();}
});

it("spreads only a recorded final TS rest array and rejects malformed rest snapshots",async()=>{
 const f=fixture("collect",[{name:"prefix",type:"string"},{name:"values",type:"number[]",rest:true}]);
 f.recorded.inputs={prefix:{complete:true,hash:"prefix"},values:{complete:true,hash:"rest"}} as any;
 try{
  expect((await f.rerun()).value).toBe("p:1,2,3");
  f.values.rest="[]";expect((await f.rerun()).value).toBe("p:");
  f.values.rest="7";await expect(f.rerun()).rejects.toThrow(/rest input.*complete array/);
 }finally{f.runtime.close();}
});
