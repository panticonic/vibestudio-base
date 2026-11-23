import {routeEvidenceRead} from "natlang:services";
import type {RouteOffer} from "./types.js";
/** Discover exact available local evidence routes and the authority operations they would require. */
export default async function discoverEvidenceRoutes():Promise<RouteOffer>{
 return routeEvidenceRead.discover();
}
