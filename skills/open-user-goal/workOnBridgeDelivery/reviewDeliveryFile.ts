import reviewVcsDelivery from "./reviewDeliveryFile/semantic/reviewVcsDelivery.nl";
import type {DeliveryScope,LocalFileReview} from "./types.js";
export default async function reviewDeliveryFile(goal:string,scope:DeliveryScope,operationId:string,path:string):Promise<LocalFileReview>{
 return reviewVcsDelivery({operationId,goal,repository:scope.repository,path});
}
