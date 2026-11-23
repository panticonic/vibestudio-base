import discoverLogFollower from "./reviewLogFollower/discoverLogFollower.js";
import stageLogFollower from "./reviewLogFollower/stageLogFollower.js";
import observeLogFollower from "./reviewLogFollower/observeLogFollower.nl";
import reconcileLogFollower from "./reviewLogFollower/reconcileLogFollower.nl";
import classifyLogOperation from "./reviewLogFollower/classifyLogOperation.nl";
import type {LogFollowerOutcome} from "./reviewLogFollower/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewLogFollower(goal:string):Promise<LogFollowerOutcome>{
 const assignment=await discoverLogFollower();
 const capture=await observeLogFollower(assignment);
 const joined=await reconcileLogFollower(assignment,capture);
 const decision=await classifyLogOperation(assignment,joined);
 const receipt=decision.stage?await stageLogFollower(assignment,joined,decision):null;
 return {decision,receipt};
}
