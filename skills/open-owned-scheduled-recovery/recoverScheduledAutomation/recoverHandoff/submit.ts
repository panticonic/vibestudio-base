import {scheduledHandoff} from "natlang:services";
import type {Lane, Receipt, Schedule, Submission} from "../../types.js";
/** Submit one local handoff for the exact observed schedule and authorization. */
export default async function submit(schedule: Schedule, authorization: Receipt, lane: Lane):Promise<Submission>{
 return scheduledHandoff.submit(schedule, authorization, lane);
}
