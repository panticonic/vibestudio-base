import {expect,it} from "vitest";
import {readFile,readdir,stat} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createEvalNatlang} from "./index.js";
import {fakeRpc,testNewFunction,toolCallMessage} from "./testSupport.js";
const base=fileURLToPath(new URL("../../..",import.meta.url));
async function invoke(programPath:string,services:Record<string,unknown>,codes:string[],goal:string){
 let turns=0;const {rpc}=fakeRpc({turn:async(input)=>{const code=codes[turns++];if(!code){const ms=(input.context as any).messages??[];throw Error('Unexpected semantic turn '+JSON.stringify(ms.filter((m:any)=>m.role==='toolResult').slice(0,2)).slice(0,2500));}return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'local-review-composition'},bindings:{rpc,fs:{readFile:(p:string)=>readFile(join(base,p),'utf8'),readdir:(p:string)=>readdir(join(base,p),{withFileTypes:true}),stat:(p:string)=>stat(join(base,p))}}});
 try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const fn=await n.load(programPath,{services}) as (goal:string)=>Promise<unknown>;return fn(goal);},{runId:'local-review-composition',signal:new AbortController().signal});expect(turns).toBe(codes.length);return result.value;}finally{runtime.close();}
}
it('selects actual candidate evidence hierarchically and returns the requested finding without an unused note',async()=>{
 const card={id:'owned',title:'Startup',usual:'startup.md',workingEvent:'working',deltaId:'delta',main:'main',mayRecord:true,edition:'working'};
 const coordinate={id:'coord',path:'startup.md',status:'composed',aspects:['content']};const frontier={id:'owned',workingEvent:'working',deltaId:'delta',repository:'clients/owned',installedDigest:'installed',coordinates:[coordinate]};
 const side=(text:string)=>({status:'text',digest:text,text});const preview={coordinate,base:side('baseline'),ours:side('local'),theirs:side('incoming'),result:'compose',composedDigest:'combined'};const calls:string[]=[];
 const services={systemCandidateRead:{discover:async()=>{calls.push('discover');return[card];},compare:async(id:string,event:string)=>{expect([id,event]).toEqual(['owned','working']);calls.push('compare');return frontier;},preview:async(id:string,event:string,c:string)=>{expect([id,event,c]).toEqual(['owned','working','coord']);calls.push('preview');return preview;},confirm:async()=>{calls.push('confirm');return{current:true,event:'working',main:'main'};},readback:async()=>{throw Error('No actor reread requested');}},systemCandidateHandoff:{record:async()=>{throw Error('No note requested');}}};
 const answer=await invoke('skills/open-user-goal/triageSystemTemplate.nl',services,[
  'const card=await findSystemCandidate(goal);const evidence=await readCandidateEvidence(goal,card);if(!evidence)throw Error("No current evidence");const plan=await planCandidateHandoff(goal,card,evidence.preview);return finishCandidateHandoff(plan,null);',
  'const cards=await systemCandidateRead.discover();return cards[0]!;',
  'const frontier=await readDeltaFrontier(card.id,card.workingEvent);const coordinate=await chooseCandidateCoordinate(goal,card,frontier);if(!coordinate)return null;const preview=await readFileTriplet(card.id,card.workingEvent,coordinate.id);return {frontier,preview};',
  'return frontier.coordinates.find(item=>item.path===card.usual)??null;',
  'return {decision:"carry-both",record:false,finding:"The actual separate local and incoming edits can coexist.",proof:[preview.base.digest!,preview.ours.digest!,preview.theirs.digest!]};',
 ],'Tell me here whether the local and incoming startup edits can coexist; do not create a note.');
 expect(answer).toEqual({finding:'The actual separate local and incoming edits can coexist.'});expect(calls).toEqual(['discover','compare','preview']);
},180000);
it('composes scaffold interpretation and retains the actual native candidate without publishing it',async()=>{
 const card={id:'brief',label:'Owned helper',names:['helper'],event:'basis',edition:'owned',permission:'draft'};const options={id:'brief',available:['stateless'],occupied:[],svelteSource:null,protectedMain:'main'};const receipt={commandId:'actual',draft:'native-draft',publication:'unchanged',runtime:'unchanged',units:[{target:'workers/helper',kind:'stateless',files:['package.json','index.ts'],manifestDigest:'manifest',entry:'index.ts',portableEntry:null,hostAbi:null,authority:[],nativeTests:[]}]};let writes=0;
 const services={scaffoldRead:{discover:async()=>[card],options:async()=>options,readback:async()=>{throw Error('No extra actor readback requested');}},scaffoldPrepare:{prepare:async(id:string,event:string,kinds:string[])=>{expect([id,event,kinds]).toEqual(['brief','basis',['stateless']]);writes++;return receipt;}}};
 const answer=await invoke('skills/open-user-goal/prepareOwnedScaffold.nl',services,[
  'const brief=await reviewScaffoldBrief(goal);const plan=await planScaffoldDraft(goal,brief.card,brief.options);const receipt=plan.disposition==="prepare"?await stageNativeScaffold(brief.card.id,brief.card.event,plan.kinds):null;return finishScaffoldDraft(plan,receipt);',
  'const card=await findScaffoldBrief(goal);return {card,options:await readInstalledScaffolds(card.id)};',
  'const cards=await scaffoldRead.discover();return cards[0]!;',
  'return {disposition:"prepare",kinds:["stateless"],finding:"The current owned brief permits this supported stateless helper."};',
 ],'Prepare the permitted stateless helper as a private local draft; do not publish or start it.');
 expect(answer).toEqual(receipt);expect(writes).toBe(1);
},180000);
it('preserves a caretaker authority hold from actual scene evidence without pretending to stage',async()=>{
 const docket={id:'estate',title:'Current garden',edition:'current'};const scene={docketId:'estate',ownerId:'owner',frontier:'now',sceneDigest:'scene',description:'Current garden',turn:2,day:1,weather:'clear',pending:false,assets:[],anchors:[]};const scope={docketId:'estate',ownerId:'owner',frontier:'now',directive:'Keep the current scene without a signed change approval',approved:false,proposed:null,requestedAsset:null};let reads=0;
 const services={grimoireScene:{discover:async()=>[docket],view:async()=>{reads++;return scene;},readScope:async()=>{reads++;return scope;},confirm:async()=>{throw Error('No staged operation needs a currentness lease');},readback:async()=>{throw Error('No actor reread is needed for this authority finding');}},grimoireHandoff:{stage:async()=>{throw Error('No authority to stage');}}};
 const answer=await invoke('skills/open-user-goal/careForGrimoireScene.nl',services,[
  'const docket=await findCaretakerDocket(goal);const evidence=await readSceneEvidence(docket.id);const plan=await planCaretakerArtifact(goal,evidence);return finishSceneHandoff(plan,null);',
  'const cards=await grimoireScene.discover();return cards[0]!;',
  'return {scene:await readOwnerView(id),scope:await readCaretakerScope(id)};',
  'return {action:"hold-authority",finding:"The installed current scene is retained; no signed staging approval is present.",proposedIds:[],description:null};',
 ],'Tell me whether a new scene is authorized and leave the installed garden alone without current approval.');
 expect(answer).toEqual({finding:'The installed current scene is retained; no signed staging approval is present.'});expect(reads).toBe(2);
},180000);
