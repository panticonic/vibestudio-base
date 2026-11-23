import {reconciliationArchive} from "natlang:services";
import type {ArchiveCard} from "../../types.js";
/** List the scoped owned historical scratch records. */
export default async function listArchive():Promise<ArchiveCard[]>{
 return reconciliationArchive.list();
}
