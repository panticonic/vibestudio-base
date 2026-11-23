import {ownedSpecialistIndex} from "natlang:services";
import type {SpecialistIndex} from "./types.js";
/** Read the current owned specialist roster and assigned product scope. */
export default async function discoverCurrentSpecialists():Promise<SpecialistIndex>{
 return ownedSpecialistIndex.list();
}
