import {launchStateWrite} from "natlang:services";
import type {LaunchNote, LaunchReport} from "./types.js";
/** Stage the exact authorized private note about the native launch-state outcome. */
export default async function writeLaunchNote(report: LaunchReport):Promise<LaunchNote | null>{
 return launchStateWrite.stage(report);
}
