import {extensionReleaseRead} from "natlang:services";
import type {ExtensionSource} from "../../types.js";
/** Read the manifest for the assigned extension at the working and protected main revisions. */
export default async function readSource(operationId: string):Promise<ExtensionSource>{
 return extensionReleaseRead.source(operationId);
}
