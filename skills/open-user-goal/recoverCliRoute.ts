import selectCliDocket from "./recoverCliRoute/selectCliDocket.nl";
import reviewRemoteRoute from "./recoverCliRoute/remote/reviewRemoteRoute.nl";
import planCliContinuation from "./recoverCliRoute/remote/planCliContinuation.nl";
import type {CliRouteOutcome} from "./recoverCliRoute/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function recoverCliRoute(goal:string):Promise<CliRouteOutcome>{
 const selected=await selectCliDocket(goal);
 if(!selected)return {status:"held",gateway:null,continuation:null,reason:"No unique current CLI docket could be bound to this request."};
 const gateway=await reviewRemoteRoute(selected.request);
 const continuation=gateway.verdict==="verified"?await planCliContinuation(selected.request):null;
 return {status:continuation?"reviewed":"held",gateway,continuation,reason:continuation?`${continuation.status}: ${continuation.action}`:`${gateway.verdict}: ${gateway.next}`};
}
