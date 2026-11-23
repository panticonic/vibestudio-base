import {extensionDesignRead} from "natlang:services";
import type {LiveExtensionDesignEvidence} from "../../types.js";
/** Read the assigned extension manifests at the current working and protected revisions. */
export default async function readExtensionDesign(operationId: string):Promise<LiveExtensionDesignEvidence>{
 return extensionDesignRead.inspect(operationId);
}
