import discoverWorkspaceSmoke from "./reviewWorkspaceSmoke/discoverWorkspaceSmoke.js";
import stageWorkspaceSmoke from "./reviewWorkspaceSmoke/stageWorkspaceSmoke.js";
import inspectSmokeFiles from "./reviewWorkspaceSmoke/inspectSmokeFiles.nl";
import selectSmokeContract from "./reviewWorkspaceSmoke/selectSmokeContract.nl";
import exerciseInstalledSmoke from "./reviewWorkspaceSmoke/exerciseInstalledSmoke.nl";
import compareSmokeOutput from "./reviewWorkspaceSmoke/compareSmokeOutput.nl";
import type {WorkspaceSmokeReport} from "./reviewWorkspaceSmoke/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewWorkspaceSmoke(goal:string):Promise<WorkspaceSmokeReport>{
 const assignment=await discoverWorkspaceSmoke();
 const source=await inspectSmokeFiles(assignment);
 const selection=await selectSmokeContract(assignment,source);
 const runtime=selection.plan?await exerciseInstalledSmoke(assignment,selection.plan):null;
 const decision=await compareSmokeOutput(assignment,selection,runtime);
 if(decision.mayRetain&&!runtime)throw new Error("Smoke retention requires an actual installed runtime observation");
 const receipt=decision.mayRetain&&runtime?await stageWorkspaceSmoke(assignment,selection,runtime,decision):null;
 return {decision,receipt};
}
