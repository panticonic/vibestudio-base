import {expect,it} from 'vitest';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEvalNatlang} from './index.js';
import {fakeRpc,testNewFunction,toolCallMessage} from './testSupport.js';
const base=fileURLToPath(new URL('../../..',import.meta.url));
it('rejects the old cross-kind field before execution and preserves the actual recorded limiting reason',async()=>{
 const reason='The powered side stopped responding while the spare tray was seated';
 const assignment={id:'owned',goal:'Distinguish the recorded limiting outcome from a suggested operating rule.',scope:'projects/owned'};
 const candidates=[{ref:'proposal-1',rationale:'Increase sampling during the changeover',tier:'stated',excerpt:'Actual original request'}];
 const selection={ref:'proposal-1',blocker:null};
 const evidence={cohort:{ref:'proposal-1',paths:[{path:'lighting/sampling.txt',count:1}],complete:true},withdrawn:[{path:'lighting/sampling.txt',counteractionRef:'counteraction-1',attempted:'The original proposal was attempted',reason}]};
 let turns=0,sawInvalidProperty=false,nativeCalls=0;
 const {rpc}=fakeRpc({turn:async(input)=>{
  const text=JSON.stringify((input.context as {messages?:unknown[]}).messages??[]);
  if(turns===1)sawInvalidProperty=/ref[\s\S]{0,100}does not exist|does not exist[\s\S]{0,100}ref|2339/.test(text);
  const code=turns++===0
   ?'const actions=evidence?.withdrawn.filter(item=>item.ref===selection.ref)??[];return {answer:actions.map(item=>item.reason).join("; ")};'
   :'const actions=evidence?.withdrawn??[];return {answer:actions.map(item=>item.reason).join("; ")};';
  if(turns>2)throw Error('Unexpected additional semantic turn');
  return toolCallMessage('eval',{code,finish:true},{input:0,output:0});
 }});
 const never=async()=>{nativeCalls++;throw Error('This closed answer computation has already-scoped evidence');};
 const services={recordedQuestionDiscovery:{discover:never,search:never},recordedQuestionGraph:{cohort:never,rejections:never}};
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'counteraction-reference-test'},bindings:{rpc,fs:{readFile:(p:string)=>readFile(join(base,p),'utf8'),readdir:(p:string)=>readdir(join(base,p),{withFileTypes:true}),stat:(p:string)=>stat(join(base,p))}}});
 try{
  const result=await runtime.runCell(async()=>{const loader=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const library=await loader.load('skills/open-user-goal',{services}) as {reviewRecordedQuestion:{answerRecordedQuestion:(...args:unknown[])=>Promise<unknown>}};const answer=library.reviewRecordedQuestion.answerRecordedQuestion;return answer(assignment.goal,assignment,candidates,selection,evidence);},{runId:'counteraction-reference-test',signal:new AbortController().signal});
  expect(turns).toBe(2);expect(sawInvalidProperty).toBe(true);expect(nativeCalls).toBe(0);
  expect(result.value).toEqual({answer:reason});
 }finally{runtime.close();}
},180000);
