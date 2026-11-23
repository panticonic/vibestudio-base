import {channelAgentDetach} from "natlang:services";
import type {ChannelAgentRequest, MembershipReceipt} from "../../types.js";
/** Unsubscribe the exact assigned worker from this channel. */
export default async function detach(request: ChannelAgentRequest):Promise<MembershipReceipt>{
 return channelAgentDetach.detach(request);
}
