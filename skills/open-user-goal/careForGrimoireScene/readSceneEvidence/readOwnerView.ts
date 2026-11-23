import {grimoireScene} from "natlang:services";
import type {GrimoireSceneView} from "../../types.js";
/** Read current public scene and asset provenance from the installed owner. */
export default async function readOwnerView(id: string):Promise<GrimoireSceneView>{
 return grimoireScene.view(id);
}
