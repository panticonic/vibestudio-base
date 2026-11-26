import {unitHandoff} from "natlang:services";
import type {UnitHandoffUnit} from "./types.js";
export default function readInstalledUnits():Promise<UnitHandoffUnit[]>{return unitHandoff.discover();}
