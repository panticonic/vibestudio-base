import {panelMigrationEvidence} from "natlang:services";
import type {MigrationObservation} from "../types.js";
/** Read the assigned panel source, exact context and declared consumer links. */
export default async function readMigration(id: string):Promise<MigrationObservation>{
 return panelMigrationEvidence.inspect(id);
}
