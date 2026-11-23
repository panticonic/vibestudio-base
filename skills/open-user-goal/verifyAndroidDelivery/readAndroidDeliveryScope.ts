import {androidDeliveryScope} from "natlang:services";
import type {AndroidDeliveryScope} from "./types.js";
/** Read the actual workspace and exact assigned disposable emulator identity. */
export default async function readAndroidDeliveryScope(goal: string):Promise<AndroidDeliveryScope>{
 return androidDeliveryScope.read(goal);
}
