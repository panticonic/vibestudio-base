import {scheduledMission} from "natlang:services";
import type {Schedule} from "./types.js";
/** Read an exact current owned schedule. */
export default async function readSchedule(id: string):Promise<Schedule>{
 return scheduledMission.observe(id);
}
