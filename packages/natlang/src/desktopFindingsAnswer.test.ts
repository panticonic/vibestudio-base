import {expect,it} from 'vitest';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEvalNatlang} from './index.js';
import {fakeRpc,testNewFunction,toolCallMessage} from './testSupport.js';
const base=fileURLToPath(new URL('../../..',import.meta.url));
it('loads the real semantic answer contract and returns findings without a forced action category',async()=>{
 let turns=0,nativeCalls=0;const {rpc}=fakeRpc({turn:async()=>{turns++;return toolCallMessage('eval',{code:'const current=evidence.window.current;if(!current)throw Error("No retained current layout");return {reason:`The schedule remains in the retained left column, parked at ${current.width}px while ${current.focused} is focused. It is not deleted; selecting the retained pane or increasing available viewport space can reveal it without rebuilding.`};',finish:true},{input:0,output:0});}});
 const never=async()=>{nativeCalls++;throw Error('This answer uses already-inspected native evidence');};
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'desktop-findings-test'},bindings:{rpc,fs:{readFile:(p:string)=>readFile(join(base,p),'utf8'),readdir:(p:string)=>readdir(join(base,p),{withFileTypes:true}),stat:(p:string)=>stat(join(base,p))}}});
 try{
  const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const answer=await n.load('skills/open-user-goal/reviewDesktopReadiness/explainDesktopReadiness.nl',{services:{desktopReadiness:{discover:never,readWindow:never,readUpdates:never}}}) as (...args:unknown[])=>Promise<unknown>;return answer('Find whether the schedule is parked or gone and explain how to keep working without rebuilding.',{desk:{id:'owned',name:'Desk',operationId:'operation'},admission:null,window:{deskId:'owned',status:'restored',before:null,current:{width:840,focused:'records',resident:['right'],parkedLeft:['left'],parkedRight:[],columns:[{id:'left',widthFr:1,panes:[{id:'schedule-pane',panelId:'schedule',heightFr:1}]}]},queuedFocus:null,pendingPlacementEdit:false},updates:{deskId:'owned',runningBuild:'running',currentBuild:'running',before:[],current:[],notices:[],events:[],admissionPending:false,previousBuilds:[],portCalls:0}});},{runId:'desktop-findings-test',signal:new AbortController().signal});
  expect(turns).toBe(1);expect(nativeCalls).toBe(0);expect(result.value).toEqual({reason:'The schedule remains in the retained left column, parked at 840px while records is focused. It is not deleted; selecting the retained pane or increasing available viewport space can reveal it without rebuilding.'});
 }finally{runtime.close();}
},180000);
