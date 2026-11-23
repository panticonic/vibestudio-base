import {launchStateRead} from "natlang:services";
import type {LaunchIndex} from "./types.js";
/** Read the exact owned active panel and its same-title archive. */
export default async function listLaunchSlots():Promise<LaunchIndex>{
 return launchStateRead.enumerate();
}
