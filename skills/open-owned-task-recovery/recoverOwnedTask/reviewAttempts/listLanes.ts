import {ownedTaskAttempts} from "natlang:services";
import type {OwnerLane} from "../../types.js";
/** Discover owned native conversations and their local follow-up permissions. */
export default async function listLanes():Promise<OwnerLane[]>{
 return ownedTaskAttempts.discover();
}
