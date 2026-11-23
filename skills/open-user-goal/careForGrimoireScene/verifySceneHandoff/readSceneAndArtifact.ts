import {grimoireScene} from "natlang:services";
import type {GrimoireSceneReadback} from "../../types.js";
/** Read current owner evidence and the exact artifact bytes. */
export default async function readSceneAndArtifact(id: string, path: string | null):Promise<GrimoireSceneReadback>{
 return grimoireScene.readback(id, path);
}
