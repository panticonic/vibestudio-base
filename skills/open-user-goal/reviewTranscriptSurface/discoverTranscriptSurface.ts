import {transcriptApproval} from "natlang:services";
import type {SurfaceAssignment} from "./types.js";
/** Read the current user's exact request and local transcript authority. */
export default async function discoverTranscriptSurface():Promise<SurfaceAssignment>{
 return transcriptApproval.discover();
}
