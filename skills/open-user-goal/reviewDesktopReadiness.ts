import locateDesktopDesk from "./reviewDesktopReadiness/locateDesktopDesk.nl";
import inspectDesktopWindow from "./reviewDesktopReadiness/inspectDesktopWindow.js";
import inspectDesktopUpdates from "./reviewDesktopReadiness/inspectDesktopUpdates.js";
import explainDesktopReadiness from "./reviewDesktopReadiness/explainDesktopReadiness.nl";
import reviewClientAdmission from "./reviewDesktopReadiness/clientDevelopment/reviewClientAdmission.nl";
import type {DesktopReadinessFindings} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewDesktopReadiness(goal:string):Promise<DesktopReadinessFindings>{
 const desk=await locateDesktopDesk(goal);
 const client=await reviewClientAdmission({goal,operationId:desk.operationId});
 const window=await inspectDesktopWindow(desk);
 const updates=await inspectDesktopUpdates(desk);
 return explainDesktopReadiness(goal,{desk,admission:client,window,updates});
}
