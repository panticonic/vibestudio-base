import type { OwnedRouteReview,RouteHandoff,RouteOffer,RouteReadback } from "./types.js";
declare module "natlang:services" {
  export const routeEvidenceRead:{
    discover():Promise<RouteOffer>;
    inspect(routeId:string):Promise<RouteReadback|null>;
  };
  export const routeEvidenceHandoff:{stage(report:OwnedRouteReview):Promise<RouteHandoff|null>};
}
