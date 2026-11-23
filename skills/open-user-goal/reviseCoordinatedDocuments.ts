import discoverRevisionDocuments from "./reviseCoordinatedDocuments/workspace/discoverRevisionDocuments.js";
import applyRevisionBatch from "./reviseCoordinatedDocuments/workspace/applyRevisionBatch.js";
import readCoordinatedRevision from "./reviseCoordinatedDocuments/workspace/readCoordinatedRevision.js";
import assessRevisionAuthority from "./reviseCoordinatedDocuments/assessRevisionAuthority.nl";
import planCoordinatedRevision from "./reviseCoordinatedDocuments/planCoordinatedRevision.nl";
import reconcileCoordinatedRevision from "./reviseCoordinatedDocuments/reconcileCoordinatedRevision.nl";
import result from "./reviseCoordinatedDocuments/result.js";
import type {CoordinatedRevisionResult} from "./reviseCoordinatedDocuments/types.js";
export default async function reviseCoordinatedDocuments(goal:string):Promise<CoordinatedRevisionResult>{
 const original=await discoverRevisionDocuments();
 const authority=await assessRevisionAuthority(goal,original);
 const plan=await planCoordinatedRevision(goal,original,authority);
 const first=plan.status==="ready"?await applyRevisionBatch(original.head,plan.destinations):null;
 let settled=plan,receipt=first;
 if(first?.status==="changed"){
  const latest=await discoverRevisionDocuments();
  const refreshed=await assessRevisionAuthority(goal,latest);
  settled=await reconcileCoordinatedRevision(goal,original,plan,latest,refreshed);
  receipt=settled.status==="ready"?await applyRevisionBatch(latest.head,settled.destinations):null;
 }
 return result(settled,await readCoordinatedRevision(),receipt);
}
