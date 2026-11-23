import {nativeWorkspaceConfig} from "natlang:services";
import type {ConfigHistory, ConfigQuestion} from "./types.js";
/** Read the scoped working, committed, and protected manifests independently. */
export default async function inspectConfigManifests(questions: ConfigQuestion[]):Promise<ConfigHistory | null>{
 return nativeWorkspaceConfig.inspectManifests(questions);
}
