import {sourceOriginEvidence} from "natlang:services";
import type {SourceAttributionAssignment} from "./types.js";
/** Observe the current user question and authorized local investigation scope. */
export default async function discoverSourceAttribution():Promise<SourceAttributionAssignment>{
 return sourceOriginEvidence.discover();
}
