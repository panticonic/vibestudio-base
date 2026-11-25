import {expect,it} from "vitest";
import {bindObservedContentReview,observedContentReview} from "./observed-content-review.js";
const contract=(required:boolean)=>({effects:{checks:["native"],rationale:"Actual persisted state"},returnedValue:{checks:["answer"],required,rationale:"Requested domain return"}});
it("reviews exact actual observations and retained prose without hidden answer words",async()=>{
 const check=bindObservedContentReview(["observed"],["artifact"]);
 const proof={goal:"Explain whether the original is still available",passed:true,checks:{native:true,answer:true},observed:{status:"missing"},artifact:"The original was removed",expected:{words:["retention"]}};
 const answer={reason:"The source file is no longer available"};
 const result=await check(proof,contract(true),answer);
 expect(result.passed).toBe(true);expect(result.semanticReviewRequired).toBe(true);
 expect(result.semanticReviewInput.actual).toEqual({goal:proof.goal,observations:{observed:proof.observed},artifacts:{artifact:proof.artifact},requestedReturn:answer});
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
 expect(observedContentReview(proof,contract(true),{findings:["Coverage stops here"]},["pages"]).semanticReviewInput.actual.observations).toEqual({pages:proof.pages});
});
it("retains native goal meaning review for pure effects without requiring an incidental return",async()=>{
 const result=await bindObservedContentReview(["observed"])({goal:"Pause the owned schedule",passed:true,checks:{native:true,answer:true},observed:{paused:true}},contract(false),{reason:"Incidental"});
 expect(result.semanticReviewRequired).toBe(true);expect(result.semanticReviewInput.actual.requestedReturn).toBeNull();
});

it("reviews a pure effect even if its optional returned explanation is wrong",async()=>{
 const proof={goal:"Pause only the assigned schedule",passed:false,checks:{native:true,answer:false},observed:{scheduleId:"owned",paused:true}};
 const result=await bindObservedContentReview(["observed"])(proof,contract(false),{reason:"wrong optional explanation"});
 expect(result.passed).toBe(true);expect(result.semanticReviewRequired).toBe(true);
 expect(result.semanticReviewInput.actual).toEqual({goal:proof.goal,observations:{observed:proof.observed},artifacts:{},requestedReturn:null});
 expect(result.semanticReviewInput.expected).toEqual({goal:proof.goal,requestedReturnRequired:false});
});
