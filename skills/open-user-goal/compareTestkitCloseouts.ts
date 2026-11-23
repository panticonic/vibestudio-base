import discoverCloseoutAttempts from "./compareTestkitCloseouts/discoverCloseoutAttempts.js";
import stageCloseoutEvidence from "./compareTestkitCloseouts/stageCloseoutEvidence.js";
import readAttempt from "./compareTestkitCloseouts/readAttempt.nl";
import decideCloseout from "./compareTestkitCloseouts/decideCloseout.nl";
import type {CloseoutReport} from "./compareTestkitCloseouts/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function compareTestkitCloseouts(goal:string):Promise<CloseoutReport>{
 const pair=await discoverCloseoutAttempts(goal);
 const current=await readAttempt(goal,pair.current),prior=await readAttempt(goal,pair.prior);
 const decision=await decideCloseout(goal,pair,current,prior);
 const handoff=decision.note?await stageCloseoutEvidence(decision):null;
 return {decision,handoff};
}
