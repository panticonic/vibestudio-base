import {tendrilRouteRetention} from "natlang:services";
import type {TendrilRouteFinding, TendrilRouteReceipt} from "../types.js";
/** Retain one independently confirmed local evidence file for this exact route. */
export default async function retainRoute(finding: TendrilRouteFinding):Promise<TendrilRouteReceipt | null>{
 return tendrilRouteRetention.retain(finding);
}
