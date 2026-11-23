import discoverMigration from "./migratePanelSource/discoverMigration.js";
import moveSource from "./migratePanelSource/moveSource.js";
import alignBuildIdentity from "./migratePanelSource/alignBuildIdentity.js";
import updateConsumers from "./migratePanelSource/updateConsumers.js";
import inspectMigration from "./migratePanelSource/inspectMigration.nl";
import planMigration from "./migratePanelSource/planMigration.nl";
import type {PanelSourceMigrationOutcome} from "./migratePanelSource/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function migratePanelSource(goal:string):Promise<PanelSourceMigrationOutcome>{
 const assignment=await discoverMigration();
 let observed=await inspectMigration(assignment);
 const finding=await planMigration(assignment,observed);
 let move=null,identity=null,consumers=null;
 if(finding.decision==="move-source"||finding.decision==="move-and-update"){
  move=await moveSource(observed);observed=move.observation;
  if(move.status!=="moved")return {finding,move,identity,consumers};
 }
 if(move||finding.decision==="align-build"||finding.decision==="align-and-update"){
  identity=await alignBuildIdentity(observed);observed=identity.observation;
  if(identity.status!=="aligned")return {finding,move,identity,consumers};
 }
 if(finding.decision==="update-consumers"||finding.decision==="move-and-update"||finding.decision==="align-and-update")consumers=await updateConsumers(observed);
 return {finding,move,identity,consumers};
}
