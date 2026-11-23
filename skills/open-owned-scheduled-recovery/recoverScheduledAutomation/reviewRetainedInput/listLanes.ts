import {scheduledHistory} from "natlang:services";
import type {Lane} from "../../types.js";
/** Discover the owned local conversations and their roles. */
export default async function listLanes():Promise<Lane[]>{
 return scheduledHistory.discover();
}
