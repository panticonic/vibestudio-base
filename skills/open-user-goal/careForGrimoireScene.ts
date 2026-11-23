import findCaretakerDocket from "./careForGrimoireScene/findCaretakerDocket.nl";
import readSceneEvidence from "./careForGrimoireScene/readSceneEvidence.nl";
import planCaretakerArtifact from "./careForGrimoireScene/planCaretakerArtifact.nl";
import confirmSceneFrontier from "./careForGrimoireScene/confirmSceneFrontier.js";
import reviseAfterMovement from "./careForGrimoireScene/reviseAfterMovement.nl";
import stageCaretakerArtifact from "./careForGrimoireScene/stageCaretakerArtifact.js";
import verifySceneHandoff from "./careForGrimoireScene/verifySceneHandoff.nl";
import finishSceneHandoff from "./careForGrimoireScene/finishSceneHandoff.js";
import type {GrimoireSceneOutcome} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function careForGrimoireScene(goal:string):Promise<GrimoireSceneOutcome>{
 const docket=await findCaretakerDocket(goal);
 const evidence=await readSceneEvidence(docket.id);
 let plan=await planCaretakerArtifact(goal,evidence);
 const gate=await confirmSceneFrontier(docket.id,evidence.scene.frontier);
 if(gate.status!=="current")plan=await reviseAfterMovement(plan,gate);
 const receipt=gate.status==="current"&&(plan.action==="stage-scene"||plan.action==="stage-note")?await stageCaretakerArtifact(docket.id,evidence.scene.frontier,plan):null;
 await verifySceneHandoff(docket.id,receipt?.path??null);
 return finishSceneHandoff(plan,receipt);
}
