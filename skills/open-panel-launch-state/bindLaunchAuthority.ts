import {launchStateRead} from "natlang:services";
import type {LaunchAuthorityRequest, LaunchPatch} from "./types.js";
/** Bind a preflight to the exact patch and observed safe slot basis. */
export default async function bindLaunchAuthority(panelId: string, basis: string, patch: LaunchPatch):Promise<LaunchAuthorityRequest | null>{
 return launchStateRead.bind(panelId,basis,patch);
}
