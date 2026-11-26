import {unitHandoff} from "natlang:services";
import type {UnitHandoffObservation} from "./types.js";
export default function beginUnit(path:string):Promise<UnitHandoffObservation>{return unitHandoff.begin(path);}
