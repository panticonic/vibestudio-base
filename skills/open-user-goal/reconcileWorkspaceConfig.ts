import readConfigBrief from "./reconcileWorkspaceConfig/settings/readConfigBrief.js";
import stageConfigDisposition from "./reconcileWorkspaceConfig/settings/stageConfigDisposition.js";
import selectConfigLens from "./reconcileWorkspaceConfig/selectConfigLens.nl";
import collectConfigEvidence from "./reconcileWorkspaceConfig/collectConfigEvidence.js";
import reviewConfigDisposition from "./reconcileWorkspaceConfig/reviewConfigDisposition.nl";
import shouldRetainConfigDisposition from "./reconcileWorkspaceConfig/shouldRetainConfigDisposition.nl";
import applicationResult from "./reconcileWorkspaceConfig/applicationResult.js";
import type {ConfigResult} from "./reconcileWorkspaceConfig/types.js";
export default async function reconcileWorkspaceConfig(goal:string):Promise<ConfigResult|null>{
 const brief=await readConfigBrief(),lens=await selectConfigLens(goal,brief);
 const evidence=await collectConfigEvidence(lens);
 if(!evidence)return null;
 const outcome=await reviewConfigDisposition(goal,brief,lens,evidence);
 const retain=await shouldRetainConfigDisposition(goal,brief,outcome);
 const handoff=retain?await stageConfigDisposition(brief,lens,evidence,outcome):null;
 return applicationResult(outcome,handoff);
}
