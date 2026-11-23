import readAndroidDeliveryScope from "./verifyAndroidDelivery/readAndroidDeliveryScope.js";
import planAndroidDelivery from "./verifyAndroidDelivery/planAndroidDelivery.nl";
import runMobileScenario from "./verifyAndroidDelivery/mobile/runMobileScenario.nl";
import type {AndroidDeliveryOutcome} from "./verifyAndroidDelivery/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function verifyAndroidDelivery(goal:string):Promise<AndroidDeliveryOutcome>{
 const scope=await readAndroidDeliveryScope(goal);
 const assignment=await planAndroidDelivery(goal,scope);
 return runMobileScenario(assignment);
}
