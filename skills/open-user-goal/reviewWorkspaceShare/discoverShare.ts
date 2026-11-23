import {workspaceShareEvidence} from "natlang:services";
import type {ShareAssignment} from "./types.js";
/** Discover the owned share review assignment including similarly titled candidate objects. */
export default async function discoverShare():Promise<ShareAssignment>{
 return workspaceShareEvidence.discover();
}
