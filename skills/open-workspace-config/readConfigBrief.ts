import {nativeWorkspaceConfig} from "natlang:services";
import type {ConfigBrief} from "./types.js";
/** Read the retained owned configuration review note, if one is available. */
export default async function readConfigBrief():Promise<ConfigBrief>{
 return nativeWorkspaceConfig.readBrief();
}
