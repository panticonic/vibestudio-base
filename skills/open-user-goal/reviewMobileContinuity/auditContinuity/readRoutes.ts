import {mobileContinuity} from "natlang:services";
import type {MobileRouteEvidence} from "../../types.js";
/** Read exact fixture-scoped mobile routes evidence. */
export default async function readRoutes(id: string):Promise<MobileRouteEvidence>{
 return mobileContinuity.routes(id);
}
