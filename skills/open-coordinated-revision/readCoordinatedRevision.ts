import {nativeCoordinatedRevision} from "natlang:services";
import type {RevisionReadback} from "./types.js";
/** Read back all exact documents and the protected basis. */
export default async function readCoordinatedRevision():Promise<RevisionReadback>{
 return nativeCoordinatedRevision.readback();
}
