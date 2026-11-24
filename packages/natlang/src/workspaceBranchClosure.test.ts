import {expect,it} from "vitest";
import {linkWorkspaceModules} from "./workspaceModules.js";
import {compileProgram,ProgramLoader,type WorkspaceFs} from "./programs.js";
import {workerdPlatform} from "../vendor/workerd/natlang-workerd.js";

const root="skills/library";
const config={serviceBinding:"explicit",workspaceModules:{"release/input":"skills/backend"},workspaceBranches:{
 release:{mounts:["release/input"],types:["ReleaseResult"]},
 deliver:{dependsOn:["release"],types:["DeliveryResult"]},
 forward:{dependsOn:["deliver"],types:["ForwardResult"]},
}};
const local={
 "natlang.json":JSON.stringify(config),"types.ts":"export type Common={value:string};",
 "common.ts":'export default function common(goal:string):string{return goal;}',
 "release.ts":'import read from "./release/input/read.js"; import type {ReleaseResult} from "./release/types.js"; export default function release(goal:string):ReleaseResult{return {value:read(goal)};}',
 "release/types.ts":'export type ReleaseResult={value:string};',
 "deliver.ts":'import release from "./release.js"; import type {DeliveryResult} from "./deliver/types.js"; export default function deliver(goal:string):DeliveryResult{return {release:release(goal)};}',
 "deliver/types.ts":'import type {ReleaseResult} from "../release/types.js";export type DeliveryResult={release:ReleaseResult};',
 "forward.ts":'import deliver from "./deliver.js";export default function forward(goal:string){return deliver(goal);}',
 "forward/types.ts":'export type {DeliveryResult as ForwardResult} from "../deliver/types.js";',
};
const backend={"read.ts":'export default function read(goal:string):string{return goal;}'};
const platform=()=>workerdPlatform({realm:{call:(body,params,args)=>Function(...params,body)(...args)}});

it("keeps declared typed feature callers and contracts closed over actual installed backends",async()=>{
 const missing=await linkWorkspaceModules(root,local,async()=>new Map());
 expect(Object.keys(missing).sort()).toEqual(["common.ts","natlang.json","types.ts"]);
 expect(missing["types.ts"]).not.toContain("ReleaseResult");
 const common=compileProgram({platform:platform(),files:missing,entry:"common.ts",label:root,root});
 expect(typeof (common.value as {default:unknown}).default).toBe("function");
 const ready=await linkWorkspaceModules(root,local,async()=>new Map([["skills/backend",backend]]));
 expect(ready["release/types.ts"]).toBe(local["release/types.ts"]);
 expect(ready["types.ts"]).toContain('export type { ReleaseResult } from "./release/types.js";');
 expect(ready["types.ts"]).toContain('export type { DeliveryResult } from "./deliver/types.js";');
 expect(ready["types.ts"]).toContain('export type { ForwardResult } from "./forward/types.js";');
 const delivery=compileProgram({platform:platform(),files:ready,entry:"deliver.ts",label:root,root});
 expect(typeof (delivery.value as {default:unknown}).default).toBe("function");
});

it.each(["absent","cycle"])("rejects invalid optional dependency graph %s before source admission",async mode=>{
 const changed=structuredClone(config);
 if(mode==="absent")changed.workspaceBranches.deliver.dependsOn=["unknown"];
 else changed.workspaceBranches.deliver.dependsOn=["forward"];
 await expect(linkWorkspaceModules(root,{...local,"natlang.json":JSON.stringify(changed)},async()=>{
  throw new Error("invalid graph must fail before source reads");
 })).rejects.toThrow(mode==="absent"?/unknown feature/:/cycle/);
});

it.each([false,true])("uses the same semantic snapshot for optional feature dependency closure (installed=%s)",async installed=>{
 const files=Object.fromEntries(Object.entries(local).map(([p,text])=>[`${root}/${p}`,text]));
 if(installed)for(const[p,text]of Object.entries(backend))files[`skills/backend/${p}`]=text;
 const requests:Array<{roots:string[];expectedSnapshot?:string}>=[];
 const fs:WorkspaceFs={
  async readFile(){throw new Error("snapshot loading must not fall back to per-file reads");},
  async readdir(){throw new Error("snapshot loading must not fall back to directory crawling");},
  async stat(){return {isDirectory:()=>false};},
  async readProgramSources(input){
   requests.push(input);
   const selected=Object.entries(files).filter(([p])=>input.roots.some(root=>p.startsWith(root+"/"))).map(([path,content])=>({path,content}));
   return {snapshot:"f".repeat(64),directories:input.roots.filter(root=>selected.some(file=>file.path.startsWith(root+"/"))),files:selected};
  },
 };
 const loader=new ProgramLoader({fs,platform:platform(),bindings:{},runTask:run=>run()});
 const module=await loader.load(installed?`${root}/deliver.ts`:`${root}/common.ts`) as {default:unknown};
 expect(typeof module.default).toBe("function");
 expect(requests).toEqual([{roots:[root]},{roots:["skills/backend"],expectedSnapshot:"f".repeat(64)}]);
});
