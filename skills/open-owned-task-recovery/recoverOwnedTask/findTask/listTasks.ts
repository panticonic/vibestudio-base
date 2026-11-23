import {ownedTaskBoard} from "natlang:services";
import type {TaskOption} from "../../types.js";
/** Discover the task options in the current owned workspace. */
export default async function listTasks():Promise<TaskOption[]>{
 return ownedTaskBoard.discover();
}
