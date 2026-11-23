import {channelAgentRead} from "natlang:services";
import type {ChannelAgentRequest, RosterObservation} from "../types.js";
/** Read the assigned channel's current durable membership for the selected handle. */
export default async function inspect(request: ChannelAgentRequest):Promise<RosterObservation>{
 return channelAgentRead.read(request);
}
