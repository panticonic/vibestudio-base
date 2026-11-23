import discoverEvidenceRoutes from "./chooseAuthorizedEvidenceRoute/workspace/discoverEvidenceRoutes.js";
import readSelectedEvidenceRoute from "./chooseAuthorizedEvidenceRoute/workspace/readSelectedEvidenceRoute.js";
import stageRouteReview from "./chooseAuthorizedEvidenceRoute/workspace/stageRouteReview.js";
import inspectExactRouteAuthority from "./chooseAuthorizedEvidenceRoute/inspectExactRouteAuthority.js";
import selectEvidenceRoute from "./chooseAuthorizedEvidenceRoute/selectEvidenceRoute.nl";
import concludeEvidenceRoute from "./chooseAuthorizedEvidenceRoute/concludeEvidenceRoute.nl";
import applicationResult from "./chooseAuthorizedEvidenceRoute/applicationResult.js";
import type {RouteResult,OwnedRouteReview} from "./chooseAuthorizedEvidenceRoute/types.js";
export default async function chooseAuthorizedEvidenceRoute(goal:string):Promise<RouteResult>{
 const offer=await discoverEvidenceRoutes(),authority=await inspectExactRouteAuthority(offer.request);
 const choice=await selectEvidenceRoute(goal,offer,authority);
 const readback=choice.execute?await readSelectedEvidenceRoute(choice.routeId):null;
 const outcome=await concludeEvidenceRoute(goal,offer,authority,choice,readback);
 const report:OwnedRouteReview={offer,authority,choice,readback,outcome,handoff:null};
 const handoff=choice.retain?await stageRouteReview(report):null;
 return applicationResult(readback,outcome,handoff);
}
