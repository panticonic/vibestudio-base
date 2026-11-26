import {expect,it} from "vitest";
import {bindObservedContentReview,observedContentReview} from "./observed-content-review.js";
const contract=(required:boolean)=>({effects:{checks:["native"],rationale:"Actual persisted state"},returnedValue:{checks:["answer"],required,rationale:"Requested domain return"}});
it("reviews exact actual observations and retained prose without hidden answer words",async()=>{
 const check=bindObservedContentReview(["observed"],["artifact"]);
 const proof={goal:"Explain whether the original is still available",passed:true,checks:{native:true,answer:true},observed:{status:"missing"},artifact:"The original was removed",expected:{words:["retention"]}};
 const answer={reason:"The source file is no longer available"};
 const result=await check(proof,contract(true),answer);
 expect(result.passed).toBe(true);expect(result.semanticReviewRequired).toBe(true);
 expect(result.semanticReviewInput.actual).toEqual({goal:proof.goal,artifacts:{artifact:proof.artifact},requestedReturn:answer,attemptedArguments:[]});
 expect(JSON.stringify(result.semanticReviewInput)).not.toContain("retention");
 expect(result.semanticReviewInput.rubric).toContain("contradictions");
});
it("excludes incidental returns after independently completed effects but still reviews retained bytes",async()=>{
 const check=bindObservedContentReview(["observed"],["artifact"]);
 const proof={goal:"Save the current decision",passed:false,checks:{native:true,answer:false},observed:{status:"saved"},artifact:"Actual retained decision"};
 const result=await check(proof,contract(false),{reason:"Incorrect later optional answer"});
 expect(result.passed).toBe(true);expect(result.semanticReviewInput.actual.requestedReturn).toBeNull();
 expect(result.semanticReviewInput.actual.artifacts).toEqual({artifact:proof.artifact});
});
it("does not waive wrong native state or a wrong required returned fact",async()=>{
 const check=bindObservedContentReview(["observed"]);
 for(const checks of [{native:false,answer:true},{native:true,answer:false}]){
  const result=await check({goal:"Read current state",passed:false,checks,observed:{status:"missing"}},contract(true),{status:"present"});
  expect(result.passed).toBe(false);
 }
});
it("synchronous native verifiers use the same exact review projection",()=>{
 const proof={goal:"Explain coverage",pages:[{cursor:"start",next:"pending"}]};
 expect(observedContentReview(proof,contract(true),{findings:["Coverage stops here"]},["pages"]).semanticReviewInput.expected.observations).toEqual({pages:proof.pages});
});
it("retains native goal meaning review for pure effects without requiring an incidental return",async()=>{
 const result=await bindObservedContentReview(["observed"])({goal:"Pause the owned schedule",passed:true,checks:{native:true,answer:true},observed:{paused:true}},contract(false),{reason:"Incidental"});
 expect(result.semanticReviewRequired).toBe(true);expect(result.semanticReviewInput.actual.requestedReturn).toBeNull();
});

it("reviews a pure effect even if its optional returned explanation is wrong",async()=>{
 const proof={goal:"Pause only the assigned schedule",passed:false,checks:{native:true,answer:false},observed:{scheduleId:"owned",paused:true}};
 const result=await bindObservedContentReview(["observed"])(proof,contract(false),{reason:"wrong optional explanation"});
 expect(result.passed).toBe(true);expect(result.semanticReviewRequired).toBe(true);
 expect(result.semanticReviewInput.actual).toEqual({goal:proof.goal,artifacts:{},requestedReturn:null,attemptedArguments:[]});
 expect(result.semanticReviewInput.expected).toEqual({goal:proof.goal,requestedReturnRequired:false,evidenceRoleLayout:"native-reference/1",observations:{observed:proof.observed}});
});

it("puts committed-state facts in reference and keeps attempted edits apart from results",async()=>{
 const effects=[{service:"reconcile",method:"apply",args:["old",{notice:"shift-board"}],result:{status:"changed",head:"withdrawn"}}];
 const proof={goal:"If withdrawn, preserve settings and tell me whether we can proceed",passed:true,checks:{native:true,answer:true},state:{notice:"paper",queue:"bay-2"},effects,choice:{status:"integrated"},artifact:"Actual explanation"};
 const before=structuredClone(proof);
 const result=await bindObservedContentReview(["state","effects","choice"],["artifact"],{nonAuthoritativeKeys:["choice"]})(proof,contract(true),{reason:"Window closed"});
 const input=result.semanticReviewInput;
 expect(input.actual).toEqual({goal:proof.goal,artifacts:{artifact:proof.artifact},requestedReturn:{reason:"Window closed"},attemptedArguments:[{path:"/effects/0/args",service:"reconcile",method:"apply",arguments:effects[0].args}]});
 expect(input.expected.observations).toEqual({state:proof.state,effects:[{service:"reconcile",method:"apply",result:effects[0].result,attemptedArgumentsPath:"/effects/0/args"}]});
 expect(JSON.stringify(input.expected)).not.toContain("shift-board");expect(JSON.stringify(input.expected)).not.toContain("integrated");
 expect(proof).toEqual(before);expect(result.semanticReviewRequired).toBe(true);
});
it("supports explicit legacy layout without weakening native or requested-answer checks",async()=>{
 const proof={goal:"Explain current state",passed:false,checks:{native:true,answer:false},state:{notice:"paper"}};
 const result=await bindObservedContentReview(["state"],[],{legacyCandidateLayout:true})(proof,contract(true),null);
 expect(result.passed).toBe(false);expect(result.semanticReviewInput.actual).toEqual({goal:proof.goal,observations:{state:proof.state},artifacts:{},requestedReturn:null});
 expect(result.semanticReviewInput.expected).toEqual({goal:proof.goal,requestedReturnRequired:true});
});
it("separates void operation arguments consistently across JSON transport without inventing a result",()=>{
 const proof={goal:"Explain a held operation",journal:[{method:"close",args:["owned"],result:undefined}]};
 const first=observedContentReview(proof,contract(false),null,["journal"]).semanticReviewInput;
 const transported=JSON.parse(JSON.stringify(proof));
 const second=observedContentReview(transported,contract(false),null,["journal"]).semanticReviewInput;
 expect(JSON.parse(JSON.stringify(first))).toEqual(second);
 expect(JSON.stringify(first.expected)).not.toContain('"args"');
 expect(first.actual.attemptedArguments).toEqual([{path:"/journal/0/args",method:"close",arguments:["owned"]}]);
 expect(JSON.parse(JSON.stringify(first.expected.observations))).toEqual({journal:[{method:"close",attemptedArgumentsPath:"/journal/0/args"}]});
});
