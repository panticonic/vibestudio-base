import {ownedSpecialistHandoff} from "natlang:services";
import type {HistoryReview, IntegrationArtifact, SpecialistPlan} from "./types.js";
/** Stage one verified user-authorized local integration brief. */
export default async function stageSpecialistHandoff(plan: SpecialistPlan, history: HistoryReview):Promise<IntegrationArtifact | null>{
 return ownedSpecialistHandoff.stage(plan, history);
}
