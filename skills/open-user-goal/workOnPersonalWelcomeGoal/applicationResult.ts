import type {WelcomeFindings,WelcomeResolution,WelcomeReviews} from "./types.js";
export default function applicationResult(explanation:string,resolved:WelcomeResolution|null,reviews:WelcomeReviews):WelcomeFindings {return {explanation,route:resolved?.route??null,setup:reviews.setup?.result??null,tour:reviews.tour?.result??null,probe:reviews.probe?.result??null};}
