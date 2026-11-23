import {scheduledMission} from "natlang:services";
import type {Schedule} from "../../types.js";
/** Discover the exact owned schedules. */
export default async function listSchedules():Promise<Schedule[]>{
 return scheduledMission.discover();
}
