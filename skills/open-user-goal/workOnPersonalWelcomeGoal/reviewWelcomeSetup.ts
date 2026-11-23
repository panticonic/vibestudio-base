import planSetup from "./reviewWelcomeSetup/onboarding/planSetup.nl";
import type {SetupWitness,WelcomeIntent} from "./types.js";
export default async function reviewWelcomeSetup(goal:string,intent:WelcomeIntent):Promise<SetupWitness>{
 const request={goal,intent};return {request,result:await planSetup(request)};
}
