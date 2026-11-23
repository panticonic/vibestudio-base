import {contentArchiveEvidence} from "natlang:services";
import type {ContentArchiveAssignment, ContentArchiveObservation} from "../types.js";
/** Read only the assigned two immutable archive listings and working project. */
export default async function readArchiveEvidence(assignment: ContentArchiveAssignment):Promise<ContentArchiveObservation>{
 return contentArchiveEvidence.inspect(assignment.id);
}
