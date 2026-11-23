import reviewScaffoldBrief from "./prepareOwnedScaffold/reviewScaffoldBrief.nl";
import planScaffoldDraft from "./prepareOwnedScaffold/planScaffoldDraft.nl";
import stageNativeScaffold from "./prepareOwnedScaffold/stageNativeScaffold.js";
import rereadScaffoldDraft from "./prepareOwnedScaffold/rereadScaffoldDraft.js";
import finishScaffoldDraft from "./prepareOwnedScaffold/finishScaffoldDraft.js";
import type {ScaffoldOutcome} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function prepareOwnedScaffold(goal:string):Promise<ScaffoldOutcome>{
 const {card,options}=await reviewScaffoldBrief(goal);
 const plan=await planScaffoldDraft(goal,card,options);
 const receipt=plan.disposition==="prepare"?await stageNativeScaffold(card.id,card.event,plan.kinds):null;
 await rereadScaffoldDraft(card.id,receipt?.draft??null);
 return finishScaffoldDraft(plan,receipt);
}
