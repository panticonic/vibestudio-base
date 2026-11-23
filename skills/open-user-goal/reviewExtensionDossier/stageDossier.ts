import {extensionDossierWrite} from "natlang:services";
import type {DossierDecision, DossierReceipt} from "./types.js";
/** Stage one privately owned local dossier for the confirmed decision. */
export default async function stageDossier(decision: DossierDecision):Promise<DossierReceipt | null>{
 return extensionDossierWrite.stage(decision);
}
