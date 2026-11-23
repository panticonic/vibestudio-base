import {buildIncidentCatalog} from "natlang:services";
import type {RetainedProfile} from "../types.js";
/** Open a retained profile in the selected local checkpoint. */
export default async function openCheckpoint(id: string):Promise<RetainedProfile>{
 return buildIncidentCatalog.open(id);
}
