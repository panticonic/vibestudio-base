import {grimoireScene} from "natlang:services";
import type {GrimoireSceneGate} from "../types.js";
/** Recheck the installed scene and public world before handing anything off. */
export default async function confirmSceneFrontier(id: string, frontier: string):Promise<GrimoireSceneGate>{
 return grimoireScene.confirm(id, frontier);
}
