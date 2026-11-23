import {contentProjectDraft} from "natlang:services";
import type {ProjectScopeLease, PreparedContentSnapshot} from "../types.js";
/** Read the actual current candidate under its existing source authorization. */
export default async function readProjectCandidate(scope: ProjectScopeLease):Promise<PreparedContentSnapshot | null>{
 return contentProjectDraft.observe(scope.receipt);
}
