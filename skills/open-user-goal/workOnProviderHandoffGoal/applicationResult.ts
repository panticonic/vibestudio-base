import type {ProviderResult,ProviderPlan,ProviderHandoff} from "./types.js";
export default function applicationResult(plan:ProviderPlan,handoff:ProviderHandoff|null):ProviderResult {return {plan,handoff};}
