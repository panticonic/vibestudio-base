import {launchStateRead} from "natlang:services";
import type {LaunchSnapshot} from "./types.js";
/** Read the persisted launch state from the independent workspace-state owner route. */
export default async function readbackLaunchSlot(panelId: string):Promise<LaunchSnapshot | null>{
 return launchStateRead.seal(panelId);
}
