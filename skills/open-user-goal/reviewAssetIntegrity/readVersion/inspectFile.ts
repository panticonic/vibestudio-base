import {assetHistory} from "natlang:services";
import type {AssetRead} from "../../types.js";
/** Read and verify one original file at an owned semantic state and coordinate. */
export default async function inspectFile(version: string, fileId: string):Promise<AssetRead>{
 return assetHistory.inspect(version, fileId);
}
