import {nativeWorkspaceConfig} from "natlang:services";
import type {ConfigDependencies} from "./types.js";
/** Read exact direct template declarations from the protected manifest, without acquiring any source. */
export default async function inspectConfigDependencies(mainEvent: string):Promise<ConfigDependencies | null>{
 return nativeWorkspaceConfig.inspectDependencies(mainEvent);
}
