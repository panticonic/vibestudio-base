import {panelMigrationChange} from "natlang:services";
import type {MigrationObservation, MigrationReceipt} from "./types.js";
/** Move the exact existing semantic repository once. */
export default async function moveSource(observed: MigrationObservation):Promise<MigrationReceipt>{
 return panelMigrationChange.move(observed.id, observed.workingRevision);
}
