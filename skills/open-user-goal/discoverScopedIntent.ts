import readIntentNotice from "./discoverScopedIntent/workspace/readIntentNotice.js";
import searchRelevantIntent from "./discoverScopedIntent/searchRelevantIntent.nl";
import describeIntentSelection from "./discoverScopedIntent/workspace/describeIntentSelection.js";
import chooseIntentActions from "./discoverScopedIntent/chooseIntentActions.nl";
import inspectIntentEvidence from "./discoverScopedIntent/workspace/inspectIntentEvidence.js";
import concludeIntentReview from "./discoverScopedIntent/concludeIntentReview.nl";
import stageIntentNote from "./discoverScopedIntent/workspace/stageIntentNote.js";
import type {IntentReport} from "./discoverScopedIntent/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function discoverScopedIntent(goal:string):Promise<IntentReport>{
 const notice=await readIntentNotice();
 const selected=await searchRelevantIntent(goal,notice);
 const capabilities=await describeIntentSelection(selected.methodIds);
 const plan=await chooseIntentActions(goal,notice,capabilities);
 const evidence=[];
 for(const action of plan.actions){
  const actual=await inspectIntentEvidence(action.methodId,action.scope);
  if(actual)evidence.push(actual);
 }
 const outcome=await concludeIntentReview(goal,plan,evidence);
 const handoff=plan.retain?await stageIntentNote(outcome):null;
 return {outcome,handoff};
}
