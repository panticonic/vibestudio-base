import {expect,it} from "vitest";
import {assessSemanticOutcome,extendSemanticOutcomeEffects,assessNativeQualification} from "./semantic-outcome-contract.js";
function observed(){return assessSemanticOutcome({passed:false,checks:{native:true,optionalReturn:false,optionalWitness:false},marker:"actual-native-proof",incorrectReturnValues:[{definition:{name:"actualLeaf",source:"actualLeaf.nl"},value:{wrong:true},required:false}]},{effects:{checks:["native"],rationale:"Independent native state."},returnedValue:{checks:["optionalReturn"],required:false,rationale:"No requested root receipt."},incidentalValues:{checks:["optionalWitness"],rationale:"Incorrect optional witness remains masked."}});}
it("extends role ownership and dimensions without reviving optional-return gates or losing actual proof",()=>{
 const before=observed(),after=extendSemanticOutcomeEffects(before,{rejectsAlias:true,rejectsBasis:true});
 expect(after.marker).toBe(before.marker);expect(after.passed).toBe(true);expect(after.outcomeContract.returnedValue.required).toBe(false);
 expect(after.outcomeContract.effects.checks).toEqual(["native","rejectsAlias","rejectsBasis"]);
 expect(after.outcomeDimensions.effects.checks).toEqual({native:true,rejectsAlias:true,rejectsBasis:true});
 expect(after.observedChecks).toEqual({native:true,optionalReturn:false,optionalWitness:false,rejectsAlias:true,rejectsBasis:true});
 expect(after.incorrectReturnValues).toEqual(before.incorrectReturnValues);expect(after.outcomeDimensions.incidentalValues?.incorrectReturns).toEqual(before.outcomeDimensions.incidentalValues?.incorrectReturns);
});
it("an actual failed qualification control fails the native dimension while retaining every original observation",()=>{
 const after=extendSemanticOutcomeEffects(observed(),{rejectsAlias:false});expect(after.passed).toBe(false);expect(after.outcomeDimensions.effects.passed).toBe(false);expect(after.checks.native).toBe(true);expect(after.checks.optionalReturn).toBe(false);
});
it("refuses duplicate, overwritten or non-boolean observations",()=>{
 for(const changed of [{native:true},{native:false},{extra:undefined}])expect(()=>extendSemanticOutcomeEffects(observed(),changed as never)).toThrow("new boolean observations");
});

it("recomputes stale published dimensions when a qualifier extends checks and contract around an assessed proof",()=>{
 const before=observed();
 const raw={...before,passed:true,checks:{...before.checks,actualNegativeControl:false},outcomeContract:{...before.outcomeContract,effects:{...before.outcomeContract.effects,checks:[...before.outcomeContract.effects.checks,"actualNegativeControl"]}},receipt:"actual-retained-receipt"};
 expect(raw.outcomeDimensions.effects.passed).toBe(true);
 const qualified=assessNativeQualification(raw);
 expect(qualified.passed).toBe(false);expect(qualified.outcomeDimensions.effects.checks.actualNegativeControl).toBe(false);
 expect(qualified.checks.optionalReturn).toBe(false);expect(qualified.outcomeContract.returnedValue.required).toBe(false);
 expect(qualified.receipt).toBe(raw.receipt);expect(qualified.incorrectReturnValues).toEqual(before.incorrectReturnValues);
});
