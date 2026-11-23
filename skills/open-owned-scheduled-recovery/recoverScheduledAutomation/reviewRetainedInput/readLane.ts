import {scheduledHistory} from "natlang:services";
import type {Receipt} from "../../types.js";
/** Read a complete retained window in the named owned conversation. */
export default async function readLane(lane: string):Promise<Receipt[]>{
 return scheduledHistory.read(lane);
}
