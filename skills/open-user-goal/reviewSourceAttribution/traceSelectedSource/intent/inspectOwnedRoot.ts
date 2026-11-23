import {sourceOriginGraph} from "natlang:services";
import type {SourceAttributionAssignment, SourceAttributionRoot} from "../../types.js";
/** Inspect a typed origin root recovered by the native bounded graph trace. */
export default async function inspectOwnedRoot(assignment: SourceAttributionAssignment, ref: string):Promise<SourceAttributionRoot>{
 return sourceOriginGraph.inspect(assignment.id, ref);
}
