import {phoneSetupPrepare} from "natlang:services";
import type {PreparedDesktop} from "../../types.js";
/** Prepare the exact desktop selected from the assigned eligible providers. */
export default async function prepareDesktop(startReceipt: string, providerId: string):Promise<PreparedDesktop>{
 return phoneSetupPrepare.prepare(startReceipt, providerId);
}
