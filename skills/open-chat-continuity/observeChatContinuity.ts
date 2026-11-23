import {chatContinuityState} from "natlang:services";
import type {ChatObservation} from "./types.js";
/** Read one native channel frontier, stock consumer view and exact worker relationship. */
export default async function observeChatContinuity(channelId: string):Promise<ChatObservation | null>{
 return chatContinuityState.read(channelId);
}
