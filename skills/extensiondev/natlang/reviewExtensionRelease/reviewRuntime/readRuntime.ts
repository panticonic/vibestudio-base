import {extensionReleaseRead} from "natlang:services";
import type {ExtensionRuntime} from "../../types.js";
/** Read the active status and method surface of the assigned live VibeStudio extension. */
export default async function readRuntime(operationId: string):Promise<ExtensionRuntime>{
 return extensionReleaseRead.runtime(operationId);
}
