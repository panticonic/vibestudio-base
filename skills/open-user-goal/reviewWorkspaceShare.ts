import discoverShare from "./reviewWorkspaceShare/discoverShare.js";
import stageShare from "./reviewWorkspaceShare/stageShare.js";
import identifyShare from "./reviewWorkspaceShare/identifyShare.nl";
import reviewSharePolicy from "./reviewWorkspaceShare/reviewSharePolicy.nl";
import type {WorkspaceShareOutcome} from "./reviewWorkspaceShare/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewWorkspaceShare(goal:string):Promise<WorkspaceShareOutcome>{
 const assignment=await discoverShare();
 const observation=await identifyShare(goal,assignment);
 const finding=await reviewSharePolicy(assignment,observation);
 const handoff=["stage-author","stage-reviewer","stage-reader"].includes(finding.decision)?await stageShare(observation,finding.decision):null;
 return {finding,handoff};
}
