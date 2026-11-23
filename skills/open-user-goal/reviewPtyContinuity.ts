import discoverPtyReview from "./reviewPtyContinuity/discoverPtyReview.js";
import stagePtyReceipt from "./reviewPtyContinuity/stagePtyReceipt.js";
import inspectPtyReceipts from "./reviewPtyContinuity/inspectPtyReceipts.nl";
import choosePtyGeneration from "./reviewPtyContinuity/choosePtyGeneration.nl";
import judgePtyContinuity from "./reviewPtyContinuity/judgePtyContinuity.nl";
import type {PtyContinuityOutcome} from "./reviewPtyContinuity/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewPtyContinuity(goal:string):Promise<PtyContinuityOutcome>{
 const assignment=await discoverPtyReview();
 const evidence=await inspectPtyReceipts(assignment);
 const choice=await choosePtyGeneration(assignment,evidence);
 const decision=await judgePtyContinuity(assignment,evidence,choice);
 const observed=[evidence.nominated,evidence.alternative].find(row=>row?.sessionId===choice.sessionId);
 if(decision.disposition==="stage-good"&&!observed)throw new Error("PTY receipt requires the actual selected generation");
 const receipt=decision.disposition==="stage-good"&&observed?await stagePtyReceipt(observed,decision):null;
 return {decision,receipt};
}
