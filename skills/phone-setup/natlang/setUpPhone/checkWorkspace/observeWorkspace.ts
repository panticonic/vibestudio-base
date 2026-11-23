import {phoneSetupRead} from "natlang:services";
import type {WorkspaceObservation} from "../../types.js";
/** Read current workspace readiness for the paired phone. */
export default async function observeWorkspace(pairingReceipt: string):Promise<WorkspaceObservation>{
 return phoneSetupRead.readiness(pairingReceipt);
}
