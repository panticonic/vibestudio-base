/** Actual public Base loader, confined Realm and gateway protocol. Scripted only: no provider. */
import {expect,it} from 'vitest';
import {createEvalNatlang} from './index.js';
import {fakeRpc,testNewFunction,toolCallMessage} from './testSupport.js';
import type {WorkspaceFs} from './programs.js';
function deferred<T=void>() { let resolve!:(value:T|PromiseLike<T>)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve}; }
function fsOf(files:Record<string,string>):WorkspaceFs{return {
 async readFile(path){if(Object.hasOwn(files,path))return files[path]!;throw Error('ENOENT '+path);},
 async stat(path){if(Object.hasOwn(files,path))return {isDirectory:()=>false};if(Object.keys(files).some(p=>p.startsWith(path+'/')))return {isDirectory:()=>true};throw Error('ENOENT '+path);},
 async readdir(path){const names=new Map<string,boolean>();for(const key of Object.keys(files)){if(!key.startsWith(path+'/'))continue;const rest=key.slice(path.length+1);names.set(rest.split('/')[0]!,rest.includes('/'));}return [...names].map(([name,directory])=>({name,isDirectory:()=>directory}));},
};}
const nextTurn=()=>new Promise<void>(resolve=>setImmediate(resolve));
for(const variant of ['private-nl','helper-gap'] as const)it(`confined Base ${variant} settles Native work before caller verification inside runCell`,async()=>{
 const gate=deferred(),middle=deferred(),entered=deferred();let operations=0,rootReturned=false,verified=false,turns=0;
 const records:{definition:{name:string};outcome:string;effects?:{service:string;method:string;error?:string}[]}[]=[];
 const prefix='skills/settlement/';
 const files:Record<string,string>={
  [prefix+'natlang.json']:JSON.stringify({name:'test-only-native-settlement',serviceBinding:'explicit',serviceScopes:{deliveryHistory:variant==='private-nl'?['root/read.ts']:['helper.ts']}}),
  [prefix+'services.d.ts']:'declare module "natlang:services" {export const deliveryHistory:{inspect(id:string):Promise<string>};}',
  [prefix+'entry.ts']:variant==='private-nl'?'import root from "./root.nl";export default async function run():Promise<string>{return await root();}':'import helper from "./helper";export default async function run(pause:Promise<void>):Promise<string>{void helper(pause);return "done";}',
  ...(variant==='private-nl'?{
   [prefix+'root.nl']:'---\nargs: {}\nreturns: string\n---\nStart the scoped read and return done.',
   [prefix+'root/read.ts']:'import {deliveryHistory} from "natlang:services";export default async function read():Promise<string>{return await deliveryHistory.inspect("native-owner");}',
  }:{[prefix+'helper.ts']:'import {deliveryHistory} from "natlang:services";export default async function helper(pause:Promise<void>):Promise<void>{await deliveryHistory.inspect("first");await pause;await deliveryHistory.inspect("second");}'}),
 };
 const {rpc}=fakeRpc({records:{record:input=>{records.push(input.record);return {recordId:input.record.call_id};}},turn:async()=>{turns++;return toolCallMessage('eval',{code:'void read();return "done";',finish:true});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'TEST-only-native-settlement-'+variant},bindings:{rpc,fs:fsOf(files)}});
 const task=runtime.runCell(async()=>{
  const natlang=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};
  const module=await natlang.load(prefix+'entry.ts',{services:{deliveryHistory:{async inspect(){operations++;entered.resolve();if(operations===1)await gate.promise;return 'actual-native-'+operations;}}}});
  if(module===null||typeof module!=='object')throw Error('Actual public TS module missing');
  const entry=Reflect.get(module,'default');if(typeof entry!=='function')throw Error('Actual public default entry missing');
  const result=await entry(middle.promise);rootReturned=true;
  // This happens before runCell's outer finally/drain; task-only settlement cannot satisfy it.
  expect(operations).toBe(variant==='private-nl'?1:2);verified=true;return result;
 },{runId:'TEST-only-native-settlement-'+variant,signal:new AbortController().signal});
 try{
  await Promise.race([entered.promise,task.then(()=>{throw Error('Entry returned without the scoped Native operation');})]);
  await nextTurn();expect(rootReturned).toBe(false);expect(verified).toBe(false);
  gate.resolve();await nextTurn();
  if(variant==='helper-gap'){expect(operations).toBe(1);expect(rootReturned).toBe(false);middle.resolve();}
  expect((await task).value).toBe('done');expect(verified).toBe(true);expect(turns).toBe(variant==='private-nl'?1:0);
  expect(records.some(record=>record.outcome==='done')).toBe(true);
  if(variant==='private-nl'){const row=records.find(record=>record.definition.name==='root');expect(row?.effects).toHaveLength(1);expect(row?.effects?.[0]).toMatchObject({service:'deliveryHistory',method:'inspect'});expect(row?.effects?.[0]?.error).toBeUndefined();}
 }finally{gate.resolve();middle.resolve();await task.catch(()=>{});runtime.close();}
},120000);
