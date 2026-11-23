import {automationActivationReadback} from "natlang:services";
import type {AutomationLaunchReadback, AutomationLaunchReceipt} from "../types.js";
/** Read the retained native scheduler definition at its exact new receipt. */
export default async function readActivatedSchedule(receipt: AutomationLaunchReceipt):Promise<AutomationLaunchReadback>{
 return automationActivationReadback.read(receipt);
}
