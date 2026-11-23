import {welcomeLocalHandoff} from "natlang:services";
import type {WelcomeHandoff, WelcomePlan, WelcomeReviews} from "./types.js";
/** Stage the verified Personal first-run result as an authorized local handoff. */
export default async function stageWelcomeNextStep(plan: WelcomePlan, reviews: WelcomeReviews):Promise<WelcomeHandoff | null>{
 return welcomeLocalHandoff.stage(plan, reviews);
}
