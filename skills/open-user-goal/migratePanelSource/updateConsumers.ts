import {panelMigrationChange} from "natlang:services";
import type {MigrationObservation, MigrationReceipt} from "./types.js";
/** Update only stale working links after the owned panel exists at the intended source. */
export default async function updateConsumers(observed: MigrationObservation):Promise<MigrationReceipt>{
 return panelMigrationChange.update(observed.id, observed.workingRevision, observed.consumerDigest);
}
