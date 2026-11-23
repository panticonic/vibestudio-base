import {localDeliveryHistory} from "natlang:services";
import type {ConversationChoice, LocalObservation} from "../types.js";
/** Read the actual current roster and retained local delivery receipts for the chosen conversation. */
export default async function inspectConversation(choice: ConversationChoice):Promise<LocalObservation>{
 return localDeliveryHistory.inspect(choice);
}
