import {scheduledMission} from "natlang:services";
import type {Change, Receipt, Resolution, Schedule} from "../../types.js";
/** Apply an authorized bounded operation using its exact current inputs. */
export default async function commitChange(schedule: Schedule, change: Change, authorization: Receipt):Promise<Resolution>{
 return scheduledMission.change(schedule, change, authorization);
}
