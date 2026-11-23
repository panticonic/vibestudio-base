import shouldRetainRecovery from "./recoverSessionGoal/shouldRetainRecovery.nl";
import {recoverySessions} from "natlang:services";
import chooseRecoverySources from "./recoverSessionGoal/chooseRecoverySources.nl";
import readRecoveryWindows from "./recoverSessionGoal/readRecoveryWindows.nl";
import interpretRecovery from "./recoverSessionGoal/interpretRecovery.nl";
import stageRecoveryHandoff from "./recoverSessionGoal/stageRecoveryHandoff.nl";
import type {RecoveryReport} from "./types.js";

export default async function recoverSessionGoal(goal:string):Promise<RecoveryReport>{
 const sources=await recoverySessions.discover();
 const ids=await chooseRecoverySources(goal,sources);
 const windows=await readRecoveryWindows(ids);
 const review=await interpretRecovery(goal,windows);
 const requested=await shouldRetainRecovery(goal);
 const handoff=requested?await stageRecoveryHandoff(review):null;
 return {review,handoff};
}
