/** Actual joint-program loader and scripted semantic gateway; no model/network. */
import {expect,it} from "vitest";
import {readFile,readdir,stat} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createEvalNatlang} from "./index.js";
import {fakeRpc,testNewFunction,toolCallMessage} from "./testSupport.js";
const root=fileURLToPath(new URL("../../..",import.meta.url));
async function invoke(name:string,goal:string,services:Record<string,unknown>,codes:string[]){
 let turns=0;
 const {rpc}=fakeRpc({turn:async(input)=>{const code=codes[turns++];if(!code)throw Error("Unexpected semantic turn: "+JSON.stringify(input.context.messages.at(-1)).slice(0,1200));return toolCallMessage("eval",{code,finish:true},{input:0,output:0});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:"user",objectKey:"installed-release-composition"},bindings:{rpc,fs:{readFile:(path:string)=>readFile(join(root,path),"utf8"),readdir:(path:string)=>readdir(join(root,path),{withFileTypes:true}),stat:(path:string)=>stat(join(root,path))}}});
 try{
  const result=await runtime.runCell(async()=>{
   const natlang=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};
   const program=await natlang.load(`skills/open-user-goal/${name}.nl`,{services}) as (goal:string)=>Promise<unknown>;
   return program(goal);
  },{runId:"installed-release-composition",signal:new AbortController().signal});
  expect(turns).toBe(codes.length);return result.value;
 }finally{runtime.close();}
}
const packageAssignment={operationId:'owned-package',goal:'Inspect the current owned package',target:'@workspace-workers/test',source:'workers/test',field:'runtime-dependency',key:'@workspace/test',scope:{source:'workers/test',field:'runtime-dependency',key:'@workspace/test',workingRevision:'revision',workingDigest:'digest',baselineDigest:'baseline',grant:'inspect'}};
const v={dependency:null,devDependency:null,peerDependency:null,contractExport:null,suite:null};
const observation={operationId:packageAssignment.operationId,target:packageAssignment.target,source:packageAssignment.source,mainRevision:'main',workingRevision:'revision',name:packageAssignment.target,baselineName:packageAssignment.target,workingDigest:'digest',baselineDigest:'baseline',receiver:null,catalog:null,baselineValue:v,workingValue:v,declaredReceiverMatches:true,scopeMatches:true,protectedValueMatchesBaseline:true,suiteBlockedBy:null,suiteRequest:null};
it('loads the public installed package NL root and private investigation with readonly native evidence',async()=>{
 let reads=0;const result=await invoke('reviewInstalledPackage','Inspect the current owned package; leave source unchanged.',{installedPackageRead:{discover:async()=>packageAssignment,inspect:async(id:string)=>{expect(id).toBe(packageAssignment.operationId);reads++;return observation;}},installedPackageChange:{restore:async()=>{throw Error('No write requested');}}},[
  'const review=await investigateInstalledPackage(goal);return review.finding;',
  'const assignment=await discoverPackage();const observation=await inspectPackage(goal,assignment);const finding=await decidePackage(assignment,observation);return {assignment,observation,finding};',
  'return readOwnedPackage(assignment.operationId);',
  'return "The actual assigned field already matches its reviewed baseline.";',
 ]);expect(result).toBe('The actual assigned field already matches its reviewed baseline.');expect(reads).toBe(1);
},180000);
it('lets the same installed root compose an actual scoped restore response without reconstructing native receipt fields',async()=>{
 let writes=0;const result=await invoke('reviewInstalledPackage','Restore the assigned approved field.',{installedPackageRead:{discover:async()=>({...packageAssignment,scope:{...packageAssignment.scope,grant:'restore'}}),inspect:async()=>({...observation,protectedValueMatchesBaseline:false})},installedPackageChange:{restore:async(id:string,head:string,digest:string)=>{expect([id,head,digest]).toEqual([packageAssignment.operationId,'revision','digest']);writes++;return{status:'restored',observation:{...observation,workingRevision:'new-revision',workingDigest:'new-digest',scopeMatches:false}};}}},[
  'const review=await investigateInstalledPackage(goal);const repair=await restorePackage(review.observation);return `The native restoration returned ${repair.status}; no suite was run.`;',
  'const assignment=await discoverPackage();const observation=await inspectPackage(goal,assignment);const finding=await decidePackage(assignment,observation);return {assignment,observation,finding};',
  'return readOwnedPackage(assignment.operationId);',
  'return "The actual scoped baseline permits this restoration.";',
  'return installedPackageChange.restore(observed.operationId,observed.workingRevision,observed.workingDigest);',
 ]);expect(writes).toBe(1);expect(result).toBe('The native restoration returned restored; no suite was run.');
},180000);
const releaseAssignment={id:'owned-release',goal:'Inspect the assigned current release.',subject:'Current release',contextId:'owned-context',buildKey:'build',effectiveVersion:'version',current:'current-run',earlier:'earlier-run',required:['completion','witness'],allowEarlier:false,grant:'read'};
const run={id:'current-run',context:'same',status:'completed',terminalSaved:true,buildKey:'build',effectiveVersion:'version',declared:['completion','witness'],unavailable:[],total:2};
const releaseCodes=[
 'const review=await investigateSystemRelease(goal);return review.evaluated?review.evaluated.assessment.reason:"No admissible run is available.";',
 'const assignment=await discoverRelease();const compared=await compareRuns(assignment);const evaluated=compared.choice.runId?await evaluateCases(assignment,compared.choice):null;return {assignment,compared,evaluated};',
 'const runs=await readRuns(assignment);const choice=await chooseRun(assignment,runs);return {runs,choice};',
 'return {runId:runs.current.id,blocker:null};',
 'const cases=await Promise.all(assignment.required.map(name=>readCase(assignment,choice,name)));const assessment=await classifyRelease(assignment,cases);return {cases,assessment};',
 'return {disposition:"report-only",reason:"Both exact retained cases contain their owned durable confirmations.",decisive:cases.map(item=>item.name)};',
];
it('loads the public release NL root and real hierarchical concurrent case investigation',async()=>{
 const names:string[]=[];const result=await invoke('reviewSystemRelease','Explain the assigned completed release; do not stage a note.',{systemReleaseEvidence:{discover:async()=>releaseAssignment,compare:async()=>({current:run,earlier:{...run,id:'earlier-run'}}),inspectCase:async(id:string,runId:string,name:string)=>{expect([id,runId]).toEqual(['owned-release','current-run']);names.push(name);return{name,digest:'digest-'+name,rank:'retained',passed:true,exactWitness:true,primary:null,cleanup:[],expectedToolFailures:[]};}},systemReleaseHandoff:{stage:async()=>{throw Error('No note requested');}}},releaseCodes);expect(names.sort()).toEqual(['completion','witness']);expect(result).toBe('Both exact retained cases contain their owned durable confirmations.');
},180000);
it('keeps a blocked release investigation readonly and preserves the actual domain finding',async()=>{
 const result=await invoke('reviewSystemRelease','Is the cancelled current attempt usable?',{systemReleaseEvidence:{discover:async()=>releaseAssignment,compare:async()=>({current:{...run,status:'cancelled'},earlier:{...run,id:'earlier-run'}}),inspectCase:async()=>{throw Error('No selected run');}},systemReleaseHandoff:{stage:async()=>{throw Error('No note authorized');}}},[...releaseCodes.slice(0,3),'return {runId:null,blocker:"hold-cancelled"};']);expect(result).toBe('No admissible run is available.');
},180000);
it('composes a current browser plan despite a different protected baseline, without restore or execution',async()=>{
 const request={operationId:'assigned-plan',goal:'Tell me whether the browser plan belongs to the current declaration; leave source untouched.',target:'workers/test',suite:'native',file:null,testName:null,mode:'inspect'};
 const a={...packageAssignment,goal:request.goal,field:'native-suite',key:'native',scope:{...packageAssignment.scope,field:'native-suite',key:'native'}};
 const current={...observation,protectedValueMatchesBaseline:false,scopeMatches:true,suiteRequest:request,baselineValue:{...v,suite:{name:'native',runtime:'native',include:['**/*.test.ts']}},workingValue:{...v,suite:{name:'native',runtime:'browser',include:['**/*.test.ts']}}};
 let plans=0;const result=await invoke('reviewInstalledPackage',request.goal,{installedPackageRead:{discover:async()=>a,inspect:async()=>current},installedPackageChange:{restore:async()=>{throw Error('No restoration requested')}},testSuitePlanRead:{resolve:async(id:string)=>{expect(id).toBe(request.operationId);plans++;return{target:request.target,suite:'native',runtime:'browser',stateHash:'actual-current-plan',contextId:'owned-context'}}},testSuiteVerificationRun:{run:async()=>{throw Error('No suite execution requested')}}},[
  'const review=await investigateInstalledPackage(goal);const suite=await reviewVerification(review.observation);if(suite===null)throw Error("Missing admitted plan");return `Yes: ${suite.plan.target} declares suite ${suite.plan.suite} with runtime ${suite.plan.runtime}. The current declaration differs from its protected baseline; no file was changed or suite run.`;',
  'const assignment=await discoverPackage();const observation=await inspectPackage(goal,assignment);const finding=await decidePackage(assignment,observation);return {assignment,observation,finding};',
  'return readOwnedPackage(assignment.operationId);',
  'if(observed.protectedValueMatchesBaseline||!observed.scopeMatches||observed.workingValue.suite===null)throw Error("Wrong native facts");return `The current ${observed.workingValue.suite.name} suite routes to ${observed.workingValue.suite.runtime}; its baseline has a different runtime. This admitted inspection does not require restore permission.`;',
  'if(observed.suiteRequest===null)return null;return nativeSuite.reviewTestSuite(observed.suiteRequest);',
  'const plan=await testSuitePlanRead.resolve(request.operationId);return {plan,decision:{route:{runtime:plan.runtime,nativeApproval:false,explanation:"The actual current plan routes to browser."},next:"report-plan"},execution:null,result:null};',
 ]);expect(plans).toBe(1);expect(result).toContain('Yes: workers/test declares suite native with runtime browser.');
},180000);
