import {nativeIntentDiscovery} from "natlang:services";
import type {IntentNotice} from "./types.js";
export default async function readIntentNotice():Promise<IntentNotice>{
 return nativeIntentDiscovery.notice();
}
