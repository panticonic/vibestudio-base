import {logFollowerHandoff} from "natlang:services";
import type {FollowAssignment, FollowDecision, FollowJoin, FollowReceipt} from "./types.js";
/** Retain the authorized exact current observation in local scratch. */
export default async function stageLogFollower(assignment: FollowAssignment, joined: FollowJoin, decision: FollowDecision):Promise<FollowReceipt>{
 return logFollowerHandoff.stage(assignment.id, joined, decision);
}
