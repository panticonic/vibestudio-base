import {logFollowerEvidence} from "natlang:services";
import type {FollowAssignment, FollowCapture} from "../types.js";
/** Read current boot, jointly captured query and streamed lines, and canceled-watch evidence. */
export default async function readNativeFollow(assignment: FollowAssignment):Promise<FollowCapture>{
 return logFollowerEvidence.observe(assignment.id);
}
