import {logFollowerEvidence} from "natlang:services";
import type {FollowAssignment} from "./types.js";
/** Read the exact follower request and authorized current or retained cursor scope. */
export default async function discoverLogFollower():Promise<FollowAssignment>{
 return logFollowerEvidence.discover();
}
