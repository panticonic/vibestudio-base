import {gadConversation} from "natlang:services";
import type {ChannelTail} from "../../types.js";
/** Read the caller's bounded channel tail. */
export default async function readConversation(operationId: string):Promise<ChannelTail>{
 return gadConversation.read(operationId);
}
