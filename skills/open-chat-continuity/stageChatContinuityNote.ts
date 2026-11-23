import {chatContinuityHandoff} from "natlang:services";
import type {ChatContinuityReport, ChatHandoff} from "./types.js";
/** Stage an authorized private chat continuity note from exact observations. */
export default async function stageChatContinuityNote(report: ChatContinuityReport):Promise<ChatHandoff | null>{
 return chatContinuityHandoff.stage(report);
}
