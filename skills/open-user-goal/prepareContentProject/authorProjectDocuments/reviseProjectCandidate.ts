import {contentProjectDraft} from "natlang:services";
import type {ProjectScopeLease, PreparedContentSnapshot} from "../types.js";
/** Apply the caller's revised documents against the exact candidate it reviewed. */
export default async function reviseProjectCandidate(scope:ProjectScopeLease,candidate:PreparedContentSnapshot,documents:{path:string;text:string}[]):Promise<PreparedContentSnapshot | null>{
 return contentProjectDraft.write(scope.receipt,candidate.head,documents);
}
