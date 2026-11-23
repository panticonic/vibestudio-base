import {phoneSetupRead} from "natlang:services";
import type {SetupStart} from "../types.js";
/** Read the assigned operation and current eligible desktop providers. */
export default async function readAssignment(operationId: string):Promise<SetupStart>{
 return phoneSetupRead.start(operationId);
}
