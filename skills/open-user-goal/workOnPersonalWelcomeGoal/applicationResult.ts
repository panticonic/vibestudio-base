import type {WelcomeResult,WelcomePlan,WelcomeReviews,WelcomeHandoff} from "./types.js";
export default function applicationResult(plan:WelcomePlan,reviews:WelcomeReviews,handoff:WelcomeHandoff|null):WelcomeResult {return {plan,setup:reviews.setup?.result??null,tour:reviews.tour?.result??null,probe:reviews.probe?.result??null,handoff};}
