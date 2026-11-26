import {extensionDossierRead} from "natlang:services";
import type {ReleaseHistory} from "../types.js";
/** Read the exact assigned release history and artifact verification. */
export default async function readHistory(operationId: string):Promise<ReleaseHistory>{
 return extensionDossierRead.history(operationId);
}
