import type {DossierReceipt,ExtensionDossierFindings} from "./types.js";
/** Preserve the requested explanation and an actual optional native receipt. */
export default function applicationResult(explanation:string,dossier:DossierReceipt|null):ExtensionDossierFindings{return {explanation,dossier};}
