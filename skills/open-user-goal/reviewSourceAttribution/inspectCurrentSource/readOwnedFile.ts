import {sourceOriginEvidence} from "natlang:services";
import type {SourceAttributionAssignment, SourceAttributionFile} from "../types.js";
/** Read the native state and owned file through the addressed source boundary. */
export default async function readOwnedFile(assignment: SourceAttributionAssignment, candidate: string):Promise<SourceAttributionFile | null>{
 return sourceOriginEvidence.read(assignment.id, candidate);
}
