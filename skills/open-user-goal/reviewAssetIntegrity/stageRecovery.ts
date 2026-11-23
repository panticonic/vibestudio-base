import {assetRecovery} from "natlang:services";
import type {AssetSelection, AssetStageResult} from "../types.js";
/** Write the exact approved binary copies only to owned scratch and return the independently verified receipt. */
export default async function stageRecovery(source: string, working: string, selection: AssetSelection[]):Promise<AssetStageResult>{
 return assetRecovery.stage(source, working, selection);
}
