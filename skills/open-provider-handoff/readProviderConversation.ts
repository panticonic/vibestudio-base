import {retainedConversationState} from "natlang:services";
import type {ConversationRead} from "./types.js";
/** Read one exact owned conversation and its retained frontier. */
export default async function readProviderConversation(channelId: string):Promise<ConversationRead | null>{
 return retainedConversationState.read(channelId);
}
