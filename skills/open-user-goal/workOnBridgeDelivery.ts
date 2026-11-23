import discover from "./workOnBridgeDelivery/project/discover.js";
import inspect from "./workOnBridgeDelivery/project/inspect.js";
import operation from "./workOnBridgeDelivery/project/operation.js";
import commitDelivery from "./workOnBridgeDelivery/project/commit.js";
import retain from "./workOnBridgeDelivery/project/retain.js";
import chooseBridgeScope from "./workOnBridgeDelivery/chooseBridgeScope.nl";
import inspectCurrentBridge from "./workOnBridgeDelivery/inspectCurrentBridge.js";
import reviewDeliveryFile from "./workOnBridgeDelivery/reviewDeliveryFile.js";
import assessRetainedBranch from "./workOnBridgeDelivery/assessRetainedBranch.nl";
import decideLocalDelivery from "./workOnBridgeDelivery/decideLocalDelivery.nl";
import applicationResult from "./workOnBridgeDelivery/applicationResult.js";
import type {BridgeResult,BridgeDeliveryReport} from "./workOnBridgeDelivery/types.js";

/** Join the actual branch and file reviews before an authorized local commit or private note. */
export default async function workOnBridgeDelivery(goal:string):Promise<BridgeResult|null>{
 const plan=await chooseBridgeScope(goal,await discover()),scope=await inspect(plan.id);
 if(!scope)return null;
 const bridgeOperation=await operation(scope.id,""),specOperation=await operation(scope.id,scope.specPath),noteOperation=await operation(scope.id,scope.notePath);
 if(!bridgeOperation||!specOperation||!noteOperation)return null;
 const local=await inspectCurrentBridge(goal,scope,bridgeOperation);
 const spec=await reviewDeliveryFile(goal,scope,specOperation,scope.specPath);
 const note=await reviewDeliveryFile(goal,scope,noteOperation,scope.notePath);
 const branch=await assessRetainedBranch(scope);
 const decision=await decideLocalDelivery(goal,plan,scope,local,spec,note,branch);
 const commit=decision.status==="commit"?await commitDelivery(scope.id,spec.snapshot.working):null;
 const record:BridgeDeliveryReport={scope,plan,local,spec,note,branch,decision,commit,handoff:null};
 const handoff=plan.handoff?await retain(record):null;
 return applicationResult(branch,decision,commit,handoff);
}
