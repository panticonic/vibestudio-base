import findRegencyRealm from "./workOnRegencyBriefing/realm/findRegencyRealm.js";
import readRegencyAccounts from "./workOnRegencyBriefing/realm/readRegencyAccounts.js";
import previewRegencySettlement from "./workOnRegencyBriefing/realm/previewRegencySettlement.js";
import advanceOwnedRegency from "./workOnRegencyBriefing/realm/advanceOwnedRegency.js";
import stageRegencyNote from "./workOnRegencyBriefing/realm/stageRegencyNote.js";
import planRegencyReview from "./workOnRegencyBriefing/planRegencyReview.nl";
import qualifyRegencyClaim from "./workOnRegencyBriefing/qualifyRegencyClaim.nl";
import decideRegencyAction from "./workOnRegencyBriefing/decideRegencyAction.nl";
import applicationResult from "./workOnRegencyBriefing/applicationResult.js";
import type {RegencyResult,RegencyReport,RegencyForecast,RegencyFinding} from "./workOnRegencyBriefing/types.js";
export default async function workOnRegencyBriefing(goal:string):Promise<RegencyResult>{
 const index=await findRegencyRealm(),opening=await readRegencyAccounts(index.realm),current=await readRegencyAccounts(index.realm);
 if(!opening||!current)throw new Error("The assigned saved Regency checkpoint is unavailable");
 const plan=await planRegencyReview(goal,index,opening,current);
 const forecasts:RegencyForecast[]=[];
 for(const horizon of plan.horizons){const forecast=await previewRegencySettlement(index.realm,current.revision,horizon);if(forecast)forecasts.push(forecast);}
 const findings:RegencyFinding[]=[];
 for(const claim of plan.claims)findings.push(await qualifyRegencyClaim(claim,opening,current,forecasts));
 const decision=await decideRegencyAction(goal,plan,current,forecasts,index,findings);
 const advance=decision.action==="advance"&&plan.advance!==null?await advanceOwnedRegency(index.realm,current.revision,plan.advance):null;
 const report:RegencyReport={plan,opening,current,forecasts,findings,decision,advance,note:null};
 const note=plan.localNote&&(decision.action==="stage"||decision.action==="advance"&&advance!==null)?await stageRegencyNote(report):null;
 return applicationResult(forecasts,findings,decision,advance,note);
}
