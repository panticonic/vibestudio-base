import {nativeIntentDiscovery} from "natlang:services";
import type {IntentDescription} from "./types.js";
/** Join chosen identities to actual current native contracts without copying model prose. */
export default async function describeIntentSelection(methodIds:string[]):Promise<IntentDescription[]>{
 const result:IntentDescription[]=[];
 for(const id of new Set(methodIds)){
  const actual=await nativeIntentDiscovery.describe(id);
  if(actual!==null)result.push(actual);
 }
 return result;
}
