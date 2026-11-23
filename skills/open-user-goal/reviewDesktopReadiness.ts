import locateDesktopDesk from "./reviewDesktopReadiness/locateDesktopDesk.nl";
import inspectDesktopWindow from "./reviewDesktopReadiness/inspectDesktopWindow.nl";
import inspectDesktopUpdates from "./reviewDesktopReadiness/inspectDesktopUpdates.nl";
import decideDesktopReadiness from "./reviewDesktopReadiness/decideDesktopReadiness.nl";
import reviewClientAdmission from "./reviewDesktopReadiness/clientDevelopment/reviewClientAdmission.nl";
import type {DesktopReadinessOutcome} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewDesktopReadiness(goal:string):Promise<DesktopReadinessOutcome>{
 const desk=await locateDesktopDesk(goal);
 const client=await reviewClientAdmission({goal,operationId:desk.operationId});
 const window=await inspectDesktopWindow(desk);
 const updates=await inspectDesktopUpdates(desk);
 return decideDesktopReadiness(goal,{desk,admission:client,window,updates});
}
