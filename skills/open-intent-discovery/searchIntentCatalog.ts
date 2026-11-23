import {nativeIntentDiscovery} from "natlang:services";
import type {IntentHit} from "./types.js";
export default async function searchIntentCatalog(query:string):Promise<IntentHit[]>{
 return nativeIntentDiscovery.search(query);
}
