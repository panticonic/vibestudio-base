import inspectActiveConfig from "./settings/inspectActiveConfig.js";
import inspectConfigManifests from "./settings/inspectConfigManifests.js";
import inspectConfigDependencies from "./settings/inspectConfigDependencies.js";
import type {ConfigLens,ConfigEvidence} from "./types.js";
export default async function collectConfigEvidence(lens:ConfigLens):Promise<ConfigEvidence|null>{
 const active=await inspectActiveConfig(lens.questions);
 if(!active)return null;
 const history=lens.inspectManifest?await inspectConfigManifests(lens.questions):null;
 const dependencies=lens.inspectDependencies&&history?await inspectConfigDependencies(history.main.ref):null;
 return {active,history,dependencies};
}
