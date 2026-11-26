import {systemReleaseEvidence} from "natlang:services";
import type {ReleaseAssignment} from "./types.js";
/** Read the current release assignment and allowed local use. */
export default async function discoverRelease():Promise<ReleaseAssignment>{
 return systemReleaseEvidence.discover();
}
