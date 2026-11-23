import {nativeIntentDiscovery} from "natlang:services";
import type {IntentDescription} from "./types.js";
export default async function describeIntentCapability(id:string):Promise<IntentDescription|null>{
 return nativeIntentDiscovery.describe(id);
}
