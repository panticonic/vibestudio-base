import {extensionDossierRead} from "natlang:services";
import type {ManifestDelta} from "../types.js";
/** Read the exact candidate and published manifest differences. */
export default async function readCandidate(operationId: string):Promise<ManifestDelta>{
 return extensionDossierRead.candidate(operationId);
}
