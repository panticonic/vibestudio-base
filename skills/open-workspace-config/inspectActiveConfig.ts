import {nativeWorkspaceConfig} from "natlang:services";
import type {ConfigIdentity, ConfigQuestion} from "./types.js";
/** Observe the exact active workspace and requested resolved settings. */
export default async function inspectActiveConfig(questions: ConfigQuestion[]):Promise<ConfigIdentity | null>{
 return nativeWorkspaceConfig.inspectActive(questions);
}
