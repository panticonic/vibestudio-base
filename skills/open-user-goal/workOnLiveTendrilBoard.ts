import findLiveTendrilTicket from "./workOnLiveTendrilBoard/findLiveTendrilTicket.nl";
import planLiveTendrilEffect from "./workOnLiveTendrilBoard/planLiveTendrilEffect.nl";
import runTendril from "./workOnLiveTendrilBoard/workflow/runTendril.nl";
import type {LiveTendrilOutcome} from "./workOnLiveTendrilBoard/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function workOnLiveTendrilBoard(goal:string):Promise<LiveTendrilOutcome>{
 const ticket=await findLiveTendrilTicket(goal);
 if(!ticket)return {actual:null,reason:"No unique current board ticket could be bound to this request."};
 const request=await planLiveTendrilEffect(goal,ticket);
 if(!request)return {actual:null,reason:"The requested effect is not supported by the observed ticket controls and layouts."};
 const actual=await runTendril(request);
 return {actual,reason:`${actual.state}${actual.presentation?`; ${actual.presentation.state}`:""}: ${actual.findings.map(row=>row.evidence.join("; ")).join("; ")}`};
}
