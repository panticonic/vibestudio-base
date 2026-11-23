import {chatContinuityIndex} from "natlang:services";
import type {ChatIndex} from "./types.js";
/** Discover exact owned source, retained receipt and possible chat candidates. */
export default async function discoverChatContinuity():Promise<ChatIndex>{
 return chatContinuityIndex.list();
}
