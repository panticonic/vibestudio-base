import {launchStateWrite} from "natlang:services";
import type {LaunchEffect, LaunchPatch} from "./types.js";
/** Patch only the exact authorized native active launch state. */
export default async function applyLaunchPatch(panelId: string, basis: string, patch: LaunchPatch):Promise<LaunchEffect | null>{
 return launchStateWrite.patch(panelId,basis,patch);
}
