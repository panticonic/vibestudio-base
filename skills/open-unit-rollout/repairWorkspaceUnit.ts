import {unitRolloutCatalog} from "natlang:services";
import chooseUnit from "./repairWorkspaceUnit/chooseUnit.nl";
import inspectUnit from "./repairWorkspaceUnit/inspectUnit.nl";
import decideNext from "./repairWorkspaceUnit/decideNext.nl";
import evolveCandidate from "./repairWorkspaceUnit/evolveCandidate.nl";
import commitCandidate from "./repairWorkspaceUnit/commitCandidate.js";
import type {UnitRolloutReport} from "./types.js";

export default async function repairWorkspaceUnit(goal:string):Promise<UnitRolloutReport>{
 const units=await unitRolloutCatalog.discover();
 const unitId=await chooseUnit(goal,units);
 if(!unitId)return {status:"held",unitId:null,revision:null,release:null,reason:"No exact current workspace unit could be selected."};
 let stage=await inspectUnit(goal,unitId),decision=await decideNext(goal,stage),repaired=false;
 const earlier:string[]=[];
 for(let attempt=0;decision.action==="repair"&&attempt<3;attempt++){
  earlier.push(decision.reason);
  const previous=stage.observation.revision;
  stage=await evolveCandidate(goal,stage,earlier);
  repaired=repaired||stage.observation.revision!==previous;
  decision=await decideNext(goal,stage);
 }
 let release=null;
 if(decision.action==="commit"){
  release=await commitCandidate(unitId,stage.observation.revision);
  if(release.status==="changed"){
   stage=await inspectUnit(goal,unitId);decision=await decideNext(goal,stage);
   if(decision.action==="commit")release=await commitCandidate(unitId,stage.observation.revision);
  }
 }
 if(release?.status==="committed")return {status:"committed",unitId,revision:release.revision,release,reason:decision.reason};
 const verified=stage.check?.revision===stage.observation.revision&&stage.check.build.status==="ok"&&stage.check.check?.status==="passed"&&stage.check.check.count>0;
 return {status:decision.action==="report"&&verified?(repaired?"repaired":"verified"):"held",unitId,revision:stage.observation.revision,release,reason:decision.reason};
}
