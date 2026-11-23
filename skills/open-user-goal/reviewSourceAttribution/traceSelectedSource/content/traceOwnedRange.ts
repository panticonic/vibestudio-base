import {sourceOriginGraph} from "natlang:services";
import type {SourceAttributionAssignment, SourceAttributionFile, SourceAttributionSelection, SourceAttributionTrace} from "../../types.js";
/** Bind a native content blame range to the exact read state and file identity. */
export default async function traceOwnedRange(assignment: SourceAttributionAssignment, file: SourceAttributionFile, selected: SourceAttributionSelection):Promise<SourceAttributionTrace>{
 return sourceOriginGraph.trace(assignment.id, file.state, selected.candidate, selected.fragment);
}
