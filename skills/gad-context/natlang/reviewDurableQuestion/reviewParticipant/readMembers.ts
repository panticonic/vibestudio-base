import {gadDurableRoster} from "natlang:services";
import type {DurableQuestionRoster} from "../../types.js";
/** Read the assigned conversation's persisted participant identities and current join/leave state. */
export default async function readMembers(historyReceipt: string):Promise<DurableQuestionRoster>{
 return gadDurableRoster.read(historyReceipt);
}
