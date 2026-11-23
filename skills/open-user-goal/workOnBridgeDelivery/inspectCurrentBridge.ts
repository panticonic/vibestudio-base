import reviewGitBridge from "./inspectCurrentBridge/bridge/reviewGitBridge.nl";
import type {DeliveryScope,LocalGitReview} from "./types.js";
export default async function inspectCurrentBridge(goal:string,scope:DeliveryScope,operationId:string):Promise<LocalGitReview>{
 return reviewGitBridge({operationId,goal,repository:scope.repository,direction:"diagnose"});
}
