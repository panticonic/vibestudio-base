import {tendrilRouteRead} from "natlang:services";
import type {TendrilRouteSnapshot} from "../../types.js";
/** Read one discovered Tendril's exact current native scope and registrations. */
export default async function readBoard(id: string):Promise<TendrilRouteSnapshot>{
 return tendrilRouteRead.readBoard(id);
}
