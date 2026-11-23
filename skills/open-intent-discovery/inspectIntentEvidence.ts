import {nativeIntentDiscovery} from "natlang:services";
import type {IntentObservation} from "./types.js";
export default async function inspectIntentEvidence(methodId:string,scope:string):Promise<IntentObservation|null>{
 return nativeIntentDiscovery.inspect(methodId,scope);
}
