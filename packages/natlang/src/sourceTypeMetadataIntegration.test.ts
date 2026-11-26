import {it,expect} from 'vitest';
import * as core from '../vendor/workerd/natlang-workerd.js';
import {ProgramLoader,compileProgram,programProductInput,type WorkspaceFs} from './programs.js';
import {confinedRealm} from './realm.js';
import {testNewFunction} from './testSupport.js';
function fsOf(files:Record<string,string>):WorkspaceFs{return{
 async readFile(path){if(Object.hasOwn(files,path))return files[path]!;throw Error('ENOENT '+path);},
 async stat(path){if(Object.hasOwn(files,path))return {isDirectory:()=>false};if(Object.keys(files).some(key=>key.startsWith(path+'/')))return {isDirectory:()=>true};throw Error('ENOENT '+path);},
 async readdir(path){const entries=new Map<string,boolean>();for(const key of Object.keys(files)){if(!key.startsWith(path+'/'))continue;const rest=key.slice(path.length+1);entries.set(rest.split('/')[0]!,rest.includes('/'));}return [...entries].map(([name,dir])=>({name,isDirectory:()=>dir}));}
};}
it('loads one validated type frontend into independent public owners and keeps mutable source, types and services fresh',async()=>{
 const files:Record<string,string>={
  'skills/typed/natlang.json':JSON.stringify({serviceBinding:'explicit',serviceScopes:{deliveryHistory:['root/read.ts']}}),
  'skills/typed/types.ts':'export type Shared={value:string};',
  'skills/typed/root.nl':'---\nargs: {}\nreturns: Shared\n---\nReturn the actual read value with this owner count.',
  'skills/typed/root/read.ts':'import {deliveryHistory} from "natlang:services";export default async function read():Promise<string>{return String(await deliveryHistory.inspect("owner"));}',
  'skills/typed/root/count.ts':'let n=0;export function next():number{return ++n;}',
  'skills/typed/services.d.ts':'declare module "natlang:services"{export const deliveryHistory:{inspect(value:string):Promise<string>};}',
 };
 const cache=new Map<string,core.VirtualProjectProduct>();let builds=0;
 const compileProduct=async(input:ReturnType<typeof programProductInput>)=>{const key=JSON.stringify(input);if(!cache.has(key)){builds++;const product=core.compileVirtualProjectProduct(input.project,input.options);expect(product.build.ok).toBe(true);expect(product.sourceTypes?.modules['/project/types.ts']?.Shared).toBeDefined();cache.set(key,product);}return JSON.parse(JSON.stringify(cache.get(key)));};
 const owners:ReturnType<typeof core.createNatlangRuntime>[]=[];
 const make=async(marker:string,numeric=false)=>{
  const platform=core.workerdPlatform({realm:confinedRealm(testNewFunction())});
  const runtime=core.createNatlangRuntime({platform,model:async()=>({calls:[['eval',{code:numeric?'return {value:Number(await read())+count.next()};':'return {value:(await read())+":"+count.next()};',finish:true}]]})});owners.push(runtime);
  const loader=new ProgramLoader({platform,fs:fsOf(files),bindings:{},compileProduct,runTask:(run,task)=>runtime.run(run,task)});
  const root=await loader.load('skills/typed/root.nl',{services:{deliveryHistory:{inspect:async()=>marker}}}) as ()=>Promise<unknown>;
  return {root,loader};
 };
 try{
  const a=await make('A'),b=await make('B');expect(builds).toBe(1);
  expect(await a.root()).toEqual({value:'A:1'});expect(await b.root()).toEqual({value:'B:1'});
  files['skills/typed/types.ts']='export type Shared={value:number};';
  files['skills/typed/root/count.ts']='let n=10;export function next():number{return ++n;}';
  const c=await make('100',true);expect(builds).toBe(2);expect(await c.root()).toEqual({value:111});
  const description=await c.loader.describe('skills/typed/root.nl');expect(JSON.stringify(description.functions.find(fn=>fn.name==='root')!.result.tree)).toContain('number');
  expect(await a.root()).toEqual({value:'A:2'});expect(await b.root()).toEqual({value:'B:2'});
 }finally{for(const owner of owners)owner.close();}
});
it('rejects a same-source frontend product with different lexical compiler options',()=>{
 const files={'root.nl':'---\nargs: {}\nreturns: string\n---\nAnswer.'};
 const input=programProductInput({files,entry:'root.nl',label:'skills/typed/root.nl',root:'skills/typed'});
 const product=core.compileVirtualProjectProduct(input.project,{...input.options,programId:'skills/other'});
 const platform=core.workerdPlatform({realm:confinedRealm(testNewFunction())});
 expect(()=>compileProgram({files,entry:'root.nl',label:'skills/typed/root.nl',root:'skills/typed',platform,product})).toThrow('different compiler inputs');
});
