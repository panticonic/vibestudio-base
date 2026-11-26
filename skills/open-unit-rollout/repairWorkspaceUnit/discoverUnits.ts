import {unitRolloutCatalog} from "natlang:services";
import type {RolloutUnit} from "../types.js";
/** Exact current catalog; discovery is not an edit/commit grant. */
export default function discoverUnits():Promise<RolloutUnit[]>{return unitRolloutCatalog.discover();}
