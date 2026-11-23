import {panelMigrationChange} from "natlang:services";
import type {MigrationObservation, MigrationReceipt} from "./types.js";
/** Align only the package name of the moved source at the reviewed revision. */
export default async function alignBuildIdentity(observed: MigrationObservation):Promise<MigrationReceipt>{
 return panelMigrationChange.align(observed.id, observed.workingRevision, observed.manifestDigest);
}
