/** Scripted gateway only: no provider, network or training data. */
import {expect,it} from "vitest";
import {readFile,readdir,stat} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createEvalNatlang} from "./index.js";
import {fakeRpc,testNewFunction,toolCallMessage} from "./testSupport.js";
const root=fileURLToPath(new URL("../../..",import.meta.url));
it.each([
 {name:"required current participant",goal:"Find the pending question and whether @sound-desk is still here.",status:"current",participant:true},
 {name:"conditional question absent",goal:"If there is a pending question, tell me whether @sound-desk is still here.",status:"no-question",participant:false},
 {name:"quote-only request",goal:"Show the exact quoted French text; do not check membership.",status:"no-question",participant:false},
 {name:"incomplete question evidence",goal:"Check the question; hold if its history is incomplete.",status:"history-incomplete",participant:false},
])("composes actual GAD readers through the gateway: $name",async scenario=>{
 const message={messageId:"native-message",envelopeId:"native-envelope",sequence:7,senderId:"native-user",senderKind:"user",role:"user",textBlocks:["Can sound-desk check captions?"]};
 const history={receipt:"native-history",channelId:"native-channel",complete:scenario.status!=="history-incomplete",through:7,messages:[message]};
 const member={participantId:"native-participant",handle:"sound-desk",displayName:"Sound Desk",kind:"agent",joinedAt:"2026-11-01",leftAt:null};
 const roster={receipt:"native-roster",channelId:history.channelId,complete:true,members:[member]};
 let historyReads=0,rosterReads=0,turns=0;
 const codes=[
  `const reviewed=await reviewQuestion(goal); const selected=reviewed.question; ${scenario.participant?'const membership=await reviewParticipant(goal,selected,reviewed.history.receipt);':''} return {historyReceipt:reviewed.history.receipt,rosterReceipt:${scenario.participant?'membership.roster.receipt':'null'},channelId:reviewed.history.channelId,question:selected,participant:${scenario.participant?'membership.participant':'{status:"not-requested",member:null}'},disposition:${scenario.status==='current'?'"ready"':'"hold"'},explanation:"Grounded in the actual observed conversation and requested conditions."};`,
  'const history=await readMessages(); return {history,question:await interpretQuestion(goal,history)};',
  `return {status:${JSON.stringify(scenario.status)},message:${scenario.status==='current'?'history.messages[0]':'null'}};`,
  ...(scenario.participant?['const roster=await readMembers(historyReceipt); return {roster,participant:await evaluateRoster(goal,question,roster)};','return {status:"confirmed",member:roster.members[0]};']:[]),
 ];
 const {rpc}=fakeRpc({turn:async()=>{const code=codes[turns++];if(!code)throw Error("Unexpected additional model turn");return toolCallMessage("eval",{code,finish:true},{input:0,output:0});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:"user",objectKey:"test-only-gad"},bindings:{rpc,fs:{readFile:(path:string)=>readFile(join(root,path),"utf8"),readdir:(path:string)=>readdir(join(root,path),{withFileTypes:true}),stat:(path:string)=>stat(join(root,path))}}});
 try{
 const result=await runtime.runCell(async()=>{
  const natlang=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};
  const entry=await natlang.load("skills/gad-context/natlang/reviewDurableQuestion.nl",{services:{gadDurableHistory:{read:async()=>{historyReads++;return history;}},gadDurableRoster:{read:async(receipt:string)=>{expect(receipt).toBe(history.receipt);rosterReads++;return roster;}}}}) as (goal:string)=>Promise<unknown>;
  return entry(scenario.goal);
 },{runId:"test-gad-composition",signal:new AbortController().signal});
 expect(result.value).toMatchObject({historyReceipt:history.receipt,channelId:history.channelId,rosterReceipt:scenario.participant?roster.receipt:null,participant:scenario.participant?{status:"confirmed",member}:{status:"not-requested",member:null},question:{status:scenario.status,message:scenario.status==='current'?message:null}});
 expect(historyReads).toBe(1);expect(rosterReads).toBe(Number(scenario.participant));expect(turns).toBe(codes.length);
 }finally{runtime.close();}
},30000);
