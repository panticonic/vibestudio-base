import {phoneFirstRun} from "natlang:services";
import type {PhonePhaseEvidence} from "../../types.js";
/** Read the source transport's bounded first-run phase evidence. */
export default async function readStartupPhases(id: string):Promise<PhonePhaseEvidence>{
 return phoneFirstRun.phases(id);
}
