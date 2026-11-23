import {contentArchiveChange} from "natlang:services";
import type {ContentArchiveAssignment, ContentArchiveChoice, ContentArchiveObservation, ContentArchivePlan, ContentArchiveReceipt} from "./types.js";
/** Restore exactly the authorized immutable paths in one version-preconditioned local edit. */
export default async function applyArchive(assignment: ContentArchiveAssignment, observation: ContentArchiveObservation, archive: ContentArchiveChoice, plan: ContentArchivePlan):Promise<ContentArchiveReceipt>{
 return contentArchiveChange.restore(assignment.id, archive.ref, observation.workingRevision, plan.paths);
}
