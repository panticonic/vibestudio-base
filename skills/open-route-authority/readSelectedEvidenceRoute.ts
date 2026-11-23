import {routeEvidenceRead} from "natlang:services";
import type {RouteReadback} from "./types.js";
/** Read independently scoped native evidence for one exact selected local route. */
export default async function readSelectedEvidenceRoute(routeId: string):Promise<RouteReadback | null>{
 return routeEvidenceRead.inspect(routeId);
}
