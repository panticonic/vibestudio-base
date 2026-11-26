import {extensionDossierRead} from "natlang:services";
import type {DossierAssignment} from "./types.js";
/** Read the exact assigned extension review and retained owner scope. */
export default async function discoverDossier():Promise<DossierAssignment>{
 return extensionDossierRead.discover();
}
