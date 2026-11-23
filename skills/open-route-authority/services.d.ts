declare module "natlang:services" {
  export const routeEvidenceRead:{
    discover():Promise<import("./types.js").RouteOffer>;
    inspect(routeId:string):Promise<import("./types.js").RouteReadback|null>;
  };
  export const routeEvidenceHandoff:{stage(report:import("./types.js").OwnedRouteReview):Promise<import("./types.js").RouteHandoff|null>};
}
