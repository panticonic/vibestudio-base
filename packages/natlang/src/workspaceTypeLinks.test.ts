import {it,expect,vi} from "vitest";
vi.mock("@workspace/natlang-services",async original=>{const actual=await original<Record<string,unknown>>();return {...actual,selectServices(_bindings:unknown,names:readonly string[]){if(names.length)throw new Error("This pure compiler fixture does not provide native services");return {};}};});
import * as core from "../vendor/workerd/natlang-workerd.js";
import {linkWorkspaceModules} from "./workspaceModules.js";
import {ProgramLoader,compileProgram,programProductInput,type WorkspaceFs} from "./programs.js";
const packages=()=>new Map([
 ["skills/discovery",{"natlang.json":JSON.stringify({include:["types.ts"]}),"package.json":JSON.stringify({name:"@workspace-skills/discovery",exports:{"./types":"./types.ts"}}),"types.ts":'import type {Native} from "@workspace-skills/reviewer/types";export type Input={native:Native};'}],
 ["skills/reviewer",{"natlang.json":JSON.stringify({include:["types.ts"]}),"package.json":JSON.stringify({name:"@workspace-skills/reviewer",exports:{"./types":"./types.ts"}}),"types.ts":'export type Native={revision:string;permission:"inspect"|"apply"};'}],
]);
const local=()=>({"natlang.json":JSON.stringify({workspaceModules:{"first/discovery":"skills/discovery","first/reviewer":"skills/reviewer","other/reviewer":"skills/reviewer"}}),"first.ts":'import type {Input} from "./first/discovery/types.js";export default function first(input:Input):string{return input.native.permission;}'});
it("links the actual public native type export in its nearest declared branch and preserves package identity",async()=>{
 const linked=await linkWorkspaceModules("skills/app",local(),async()=>packages());
 expect(linked["first/discovery/types.ts"]).toContain('from "../reviewer/types.js"');
 expect(JSON.parse(linked["first/reviewer/package.json"]!).exports).toEqual({"./types":"./types.ts"});
 const compiled=compileProgram({files:linked,entry:"first.ts",label:"skills/app/first.ts",root:"skills/app",platform:core.workerdPlatform({realm:{call:(body:string,params:string[],args:unknown[])=>Function(...params,body)(...args)}})});
 expect((compiled.value as any).default({native:{revision:"r",permission:"inspect"}})).toBe("inspect");
});
it("does not reach undeclared, unexported, excluded or escaping private type files",async()=>{
 for(const mode of ["private","excluded","escape","ambiguous"]){
  const projects=packages(),files=projects.get("skills/reviewer")!;
  if(mode==="private")projects.get("skills/discovery")!["types.ts"]='export type {Native} from "@workspace-skills/reviewer/private";';
  if(mode==="excluded")files["natlang.json"]=JSON.stringify({include:["package.json"]});
  if(mode==="escape")files["package.json"]=JSON.stringify({name:"@workspace-skills/reviewer",exports:{"./types":"./../private.ts"}});
  const source=local();if(mode==="ambiguous")source["natlang.json"]=JSON.stringify({workspaceModules:{"discovery":"skills/discovery","a":"skills/reviewer","b":"skills/reviewer"}});
  await expect(linkWorkspaceModules("skills/app",source,async()=>projects)).rejects.toThrow(/does not export|not included|escapes|non-relative|ambiguous/);
 }
});
function fsOf(files:Record<string,string>):WorkspaceFs{return {
 async stat(path){if(Object.hasOwn(files,path))return {isDirectory:()=>false};if(Object.keys(files).some(key=>key.startsWith(path+"/")))return {isDirectory:()=>true};throw Object.assign(Error(path),{code:"ENOENT"});},
 async readFile(path){if(Object.hasOwn(files,path))return files[path]!;throw Object.assign(Error(path),{code:"ENOENT"});},
 async readdir(path){const children=new Map<string,boolean>();for(const name of Object.keys(files)){if(!name.startsWith(path+"/"))continue;const rest=name.slice(path.length+1),[child]=rest.split("/");children.set(child!,rest.includes("/"));}return [...children].map(([name,directory])=>({name,isDirectory:()=>directory}));}
};}
it("shares one stable frontend across entry paths and owners without sharing module instances",async()=>{
 const files={"natlang.json":"{}","first.ts":"let count=0;export default function first():number{return ++count;}","second.ts":"import first from './first.js';export default function second():number{return first();}"};
 const first=programProductInput({files,entry:"first.ts",label:"skills/app/first.ts",root:"skills/app"});
 expect(first).toEqual(programProductInput({files,entry:"second.ts",label:"skills/app/second.ts",root:"skills/app"}));
 const fs=fsOf(Object.fromEntries(Object.entries(files).map(([path,text])=>["skills/app/"+path,text]))),cache=new Map<string,unknown>();let builds=0;
 const compileProduct=async(input:ReturnType<typeof programProductInput>)=>{const key=JSON.stringify(input);if(!cache.has(key)){builds++;cache.set(key,core.compileVirtualProjectProduct(input.project,input.options));}return cache.get(key);};
 const make=()=>new ProgramLoader({fs,bindings:{},platform:core.workerdPlatform({realm:{call:(body:string,params:string[],args:unknown[])=>Function(...params,body)(...args)}}),runTask:fn=>fn(),compileProduct});
 const a=await make().load("skills/app/first.ts") as any,b=await make().load("skills/app/second.ts") as any;
 expect(builds).toBe(1);expect(await a.default()).toBe(1);expect(await b.default()).toBe(1);expect(await a.default()).toBe(2);
});
