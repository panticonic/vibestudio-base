import {boardMigration} from "natlang:services";
import type {MigrationBasis} from "./types.js";
/** Observe the exact assigned target; this does not retain or mutate a board. */
export default async function readMigrationTarget():Promise<MigrationBasis>{return boardMigration.readTarget();}
