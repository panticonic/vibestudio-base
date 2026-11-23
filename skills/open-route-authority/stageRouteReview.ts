import {routeEvidenceHandoff} from "natlang:services";
import type {OwnedRouteReview, RouteHandoff} from "./types.js";
/** Retain the authorized private result and its exact route and independent evidence. */
export default async function stageRouteReview(report: OwnedRouteReview):Promise<RouteHandoff | null>{
 return routeEvidenceHandoff.stage(report);
}
