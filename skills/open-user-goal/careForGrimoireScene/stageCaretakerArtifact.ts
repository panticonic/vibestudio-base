import {grimoireHandoff} from "natlang:services";
import type {GrimoirePlan, GrimoireSceneReceipt} from "../types.js";
/** Stage one private scratch artifact against the currently confirmed Grimoire frontier. */
export default async function stageCaretakerArtifact(id: string, frontier: string, plan: GrimoirePlan):Promise<GrimoireSceneReceipt | null>{
 return grimoireHandoff.stage(id, frontier, plan);
}
