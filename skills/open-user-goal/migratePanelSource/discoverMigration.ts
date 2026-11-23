import {panelMigrationEvidence} from "natlang:services";
import type {PanelMigrationAssignment} from "./types.js";
/** Discover the exact scoped local panel migration assignment. */
export default async function discoverMigration():Promise<PanelMigrationAssignment>{
 return panelMigrationEvidence.discover();
}
