import {automationLifecycleRead} from "natlang:services";
import type {MissionObservation} from "../types.js";
/** Read the exact assigned automation's state and revision from the controller. */
export default async function observeMission(missionId: string):Promise<MissionObservation | null>{
 return automationLifecycleRead.observe(missionId);
}
