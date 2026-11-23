import {ownedTaskHandoff} from "natlang:services";
import type {HandoffAttempt, MessageReceipt} from "../../types.js";
/** Recover the exact original local handoff receipt. */
export default async function readNote(attempt: HandoffAttempt):Promise<MessageReceipt | null>{
 return ownedTaskHandoff.read(attempt.attemptId);
}
