import {scheduledHandoff} from "natlang:services";
import type {Receipt, Submission} from "../../types.js";
/** Read back the original native handoff attempt. */
export default async function readback(submission: Submission):Promise<Receipt | null>{
 return scheduledHandoff.read(submission);
}
