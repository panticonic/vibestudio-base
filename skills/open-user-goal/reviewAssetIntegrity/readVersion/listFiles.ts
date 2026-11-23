import {assetHistory} from "natlang:services";
import type {AssetFile} from "../../types.js";
/** List exact file coordinates at one owned semantic state. */
export default async function listFiles(version: string):Promise<AssetFile[]>{
 return assetHistory.listFiles(version);
}
