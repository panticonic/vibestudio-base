import {retainedConversationIndex} from "natlang:services";
import type {ConversationCard} from "./types.js";
/** Discover the scoped conversation records with retained provider operations. */
export default async function discoverRetainedConversations():Promise<ConversationCard[]>{
 return retainedConversationIndex.list();
}
