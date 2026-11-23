import reviewProjectEvidence from "./prepareContentProject/reviewProjectEvidence.js";
import confirmProjectScope from "./prepareContentProject/confirmProjectScope.js";
import authorProjectDocuments from "./prepareContentProject/authorProjectDocuments.nl";
import finishPrivateProject from "./prepareContentProject/finishPrivateProject.js";
import projectResult from "./prepareContentProject/projectResult.js";
import type {ContentProjectResult} from "./prepareContentProject/types.js";
/** Compose semantic source review and document authorship around exact native scope and commit operations. */
export default async function prepareContentProject(goal:string):Promise<ContentProjectResult>{
 const {evidence,decision}=await reviewProjectEvidence(goal);
 if(decision.action==="hold")return projectResult({outcome:"held",candidate:null,event:null});
 const scope=await confirmProjectScope(evidence,decision);
 if(scope.status!=="admitted")return projectResult({outcome:scope.status==="moved"?"held-moved":"held",candidate:null,event:null});
 const draft=await authorProjectDocuments(scope);
 return projectResult(await finishPrivateProject(decision,scope,draft));
}
