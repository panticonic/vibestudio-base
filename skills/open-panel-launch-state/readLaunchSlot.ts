import {launchStateRead} from "natlang:services";
import type {LaunchSnapshot} from "./types.js";
/** Observe one actual panel launch slot and current native generation. */
export default async function readLaunchSlot(panelId: string):Promise<LaunchSnapshot | null>{
 return launchStateRead.read(panelId);
}
