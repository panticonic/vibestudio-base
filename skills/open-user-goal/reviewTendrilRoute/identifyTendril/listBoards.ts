import {tendrilRouteRead} from "natlang:services";
import type {TendrilBoardCard} from "../../types.js";
/** Discover the assigned local Tendrils. */
export default async function listBoards():Promise<TendrilBoardCard[]>{
 return tendrilRouteRead.listBoards();
}
