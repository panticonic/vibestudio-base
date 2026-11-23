import type {ProviderResult,ProviderPlan} from "./types.js";
export default function applicationResult(plan:ProviderPlan,handoff:ProviderResult["handoff"]):ProviderResult {return {plan,handoff};}
