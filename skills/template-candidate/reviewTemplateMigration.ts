import {templateMigration} from "natlang:services";
import chooseMigrationEvidence from "./reviewTemplateMigration/chooseMigrationEvidence.nl";
import decideMigration from "./reviewTemplateMigration/decideMigration.nl";
import finishMigration from "./reviewTemplateMigration/finishMigration.nl";
import stageTemplateCandidate from "./stageTemplateCandidate.nl";
import type {MigrationReport} from "./types.js";

export default async function reviewTemplateMigration(goal:string):Promise<MigrationReport>{
 let current=await templateMigration.discover();
 let ids=await chooseMigrationEvidence(goal,current);
 let readings=await templateMigration.read(current.revision,ids);
 if(readings===null){current=await templateMigration.discover();ids=await chooseMigrationEvidence(goal,current);readings=await templateMigration.read(current.revision,ids);}
 let decision=await decideMigration(goal,current,readings??[]);
 if(readings!==null&&decision.prepare&&decision.candidateId){
  const request=await templateMigration.authorizeStage(current.revision,decision.candidateId);
  const candidate=request?await stageTemplateCandidate(request):null;
  decision=await finishMigration(decision,candidate);
 }
 const handoff=readings!==null&&decision.recipient?await templateMigration.stageHandoff(current.revision,decision.candidateId,decision.status,decision.recipient):null;
 return {status:decision.status,candidateId:decision.candidateId,handoff,answer:decision.answer};
}
