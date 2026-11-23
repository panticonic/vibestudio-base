import {ownedTaskAttempts} from "natlang:services";
import type {LaneObservation} from "../../types.js";
/** Inspect a native conversation and any retained addressed attempt. */
export default async function readLane(lane: string, recipient: string | null):Promise<LaneObservation>{
 return ownedTaskAttempts.inspect(lane, recipient);
}
