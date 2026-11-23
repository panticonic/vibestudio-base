import {contentArchiveEvidence} from "natlang:services";
import type {ContentArchiveAssignment} from "./types.js";
/** Get the project, approved immutable edition and current working authority. */
export default async function discoverArchive():Promise<ContentArchiveAssignment>{
 return contentArchiveEvidence.discover();
}
