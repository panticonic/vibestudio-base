/** Actual public joint-loader controls; scripted model/native ports are not training data. */
import {expect,it,vi} from 'vitest';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {URL as NodeURL,fileURLToPath} from 'node:url';
import {createEvalNatlang} from './index.js';
import {fakeRpc,testNewFunction,toolCallMessage} from './testSupport.js';
const base=fileURLToPath(new NodeURL('../../..',import.meta.url));
async function execute(path:string,goal:string,codes:string[],services:object){
 let turns=0;
 const {rpc}=fakeRpc({turn:async()=>{const code=codes[turns++];if(!code)throw Error('Unexpected extra semantic call');return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'media-domain-composition-control'},bindings:{rpc,fs:{readFile:(path:string)=>readFile(join(base,path),'utf8'),readdir:(path:string)=>readdir(join(base,path),{withFileTypes:true}),stat:(path:string)=>stat(join(base,path))}}});
 try{
  const result=await runtime.runCell(async()=>{const natlang=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};const program=await natlang.load(path,{services}) as (goal:string)=>Promise<unknown>;return program(goal)},{runId:'media-domain-composition-control',signal:new AbortController().signal});
  expect(turns).toBe(codes.length);return result.value;
 }finally{await runtime.close()}
}
it('keeps the requested explanation when a model-owned notification root acknowledges an exact current notice',async()=>{
 const lane={id:'owned-lane',label:'Box Office',generation:1};
 const notice={id:'matinee',kind:'work.notice',title:'Matinee access',revision:1,createdAt:10};
 const evening={id:'evening',kind:'work.notice',title:'Evening access',revision:1,createdAt:11};
 const snapshot={lane,attention:[notice,evening],retained:[],unreadCount:2,retainedCount:0};
 const refresh={authority:'unchanged',lane,discardedPriorRead:true,producerReceipt:'none'};
 const acknowledgment={status:'acknowledged',id:'matinee',revision:1};
 const read=vi.fn(async()=>snapshot),acknowledge=vi.fn(async()=>acknowledgment);
 const codes=[
 'const lane=await locateNotificationLane(goal);const lifecycle=await readNotificationLifecycle(lane);const decision=await chooseNotificationAction(goal,lifecycle);return finishNotificationReview(lifecycle,decision);',
 'return (await notificationState.discover())[0];',
 'const original=await notificationState.read(lane);const refresh=await notificationState.refresh(lane);const current=refresh.lane?await notificationState.read(refresh.lane):null;return {original,refresh,current};',
 'const finding=await findCurrentNotification(goal,lifecycle);return {action:"acknowledge",finding,reason:"The exact matinee notice was acknowledged; the evening follow-up remains pending."};',
 'const record=lifecycle.current.attention.find(row=>row.id==="matinee");if(!record)throw Error("No actual matinee");return {state:"pending",id:record.id,revision:record.revision};',
 ];
 const result=await execute('skills/open-user-goal/reviewNotificationState.nl','Clear the matinee access note only, keep the evening follow-up pending, and confirm both are still retained.',codes,{notificationState:{discover:async()=>[lane],read,refresh:async()=>refresh,acknowledge}}) as any;
 expect(acknowledge).toHaveBeenCalledWith(lane,'matinee',1);expect(read).toHaveBeenCalledTimes(3);
 expect(result.acknowledgment).toEqual(acknowledgment);expect(result.explanation).toContain('evening follow-up remains pending');
},180000);
