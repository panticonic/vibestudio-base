import {automationActivationEvidence} from "natlang:services";
import type {AutomationLaunchEvidence} from "../types.js";
/** Read the private request and consent docket at its recorded revision. */
export default async function readLaunchEvidence():Promise<AutomationLaunchEvidence>{
 return automationActivationEvidence.observe();
}
