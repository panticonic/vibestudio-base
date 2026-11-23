import {workspaceSmokeEvidence} from "natlang:services";
import type {SmokeAssignment} from "./types.js";
/** Read the current accepted regression task and local retention permission. */
export default async function discoverWorkspaceSmoke():Promise<SmokeAssignment>{
 return workspaceSmokeEvidence.discover();
}
