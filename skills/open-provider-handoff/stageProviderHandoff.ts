import {retainedProviderHandoff} from "natlang:services";
import type {ProviderHandoff, ProviderPlan} from "./types.js";
/** Stage the authorized scoped recap of retained approval and delivery evidence. */
export default async function stageProviderHandoff(plan: ProviderPlan):Promise<ProviderHandoff | null>{
 return retainedProviderHandoff.stage(plan);
}
