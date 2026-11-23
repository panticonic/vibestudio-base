import {problemIncident} from "natlang:services";
import saveProblemDraft from "./workOnProblemReportGoal/reporter/saveProblemDraft.nl";
import selectIncident from "./workOnProblemReportGoal/selectIncident.nl";
import type {OpenProblemOutcome} from "./workOnProblemReportGoal/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function workOnProblemReportGoal(goal:string):Promise<OpenProblemOutcome>{
 const incidents=await problemIncident.discover();
 const id=await selectIncident(goal,incidents);
 if(!id)return null;
 const operation=await problemIncident.open(id);
 if(!operation)return null;
 return saveProblemDraft({goal,operationId:operation.operationId});
}
