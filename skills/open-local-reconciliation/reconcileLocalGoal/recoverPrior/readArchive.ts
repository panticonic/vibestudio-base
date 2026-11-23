import {reconciliationArchive} from "natlang:services";
import type {ArchiveSnapshot} from "../../types.js";
/** Read the actual historical evidence bytes for an observed record. */
export default async function readArchive(id: string):Promise<ArchiveSnapshot | null>{
 return reconciliationArchive.read(id);
}
