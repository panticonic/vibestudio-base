import {assetHistory} from "natlang:services";
import type {AssetVersion} from "../types.js";
/** Discover the exact owned retained and working versions of the bundle. */
export default async function discoverVersions():Promise<AssetVersion[]>{
 return assetHistory.discover();
}
