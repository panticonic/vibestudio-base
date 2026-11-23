import locateMaintenanceSkill from "./maintainWorkspaceSkill/locateMaintenanceSkill.nl";
import inspectMaintenanceEvidence from "./maintainWorkspaceSkill/inspectMaintenanceEvidence.nl";
import confirmSkillFrontier from "./maintainWorkspaceSkill/confirmSkillFrontier.js";
import decideSkillMaintenance from "./maintainWorkspaceSkill/decideSkillMaintenance.nl";
import prepareSkillRepair from "./maintainWorkspaceSkill/prepareSkillRepair.nl";
import checkSkillReadback from "./maintainWorkspaceSkill/checkSkillReadback.js";
import finishSkillMaintenance from "./maintainWorkspaceSkill/finishSkillMaintenance.js";
import reviewProgram from "./maintainWorkspaceSkill/authoring/reviewProgram.nl";
import type {SkillMaintenanceOutcome} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function maintainWorkspaceSkill(goal:string):Promise<SkillMaintenanceOutcome>{
 const card=await locateMaintenanceSkill(goal);
 const observation=await inspectMaintenanceEvidence(card);
 await reviewProgram(observation.authoringRequest);
 const gate=await confirmSkillFrontier(card,observation.revision);
 const decision=await decideSkillMaintenance(goal,observation,gate);
 const receipt=decision.action==="stage-local-patch"?await prepareSkillRepair(goal,observation):null;
 await checkSkillReadback(card);
 return finishSkillMaintenance(decision,receipt);
}
