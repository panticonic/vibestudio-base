import {nativeCoordinatedRevision} from "natlang:services";
import type {RevisionScope} from "./types.js";
/** Read the exact owned workspace document catalog and its working basis. */
export default async function discoverRevisionDocuments():Promise<RevisionScope>{
 return nativeCoordinatedRevision.discover();
}
