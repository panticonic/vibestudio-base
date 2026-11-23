import discoverSameTurnEval from "./recoverSameTurnEval/discoverSameTurnEval.js";
import resolveSameTurnEval from "./recoverSameTurnEval/resolveSameTurnEval.js";
import inspectSameTurnEval from "./recoverSameTurnEval/inspectSameTurnEval.nl";
import chooseSameTurnRecovery from "./recoverSameTurnEval/chooseSameTurnRecovery.nl";
import type {SameTurnEvalOutcome} from "./recoverSameTurnEval/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function recoverSameTurnEval(goal:string):Promise<SameTurnEvalOutcome>{
 const assignment=await discoverSameTurnEval();
 const evidence=await inspectSameTurnEval(assignment);
 const pick=await chooseSameTurnRecovery(assignment,evidence);
 const recovery=pick.decision!=="held"?await resolveSameTurnEval(assignment,evidence,pick):null;
 return {pick,recovery};
}
