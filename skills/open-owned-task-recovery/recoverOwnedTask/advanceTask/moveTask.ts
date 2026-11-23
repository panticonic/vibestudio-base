import {ownedTaskBoard} from "natlang:services";
import type {TaskStatus, TaskView, UpdateTaskResult} from "../../types.js";
/** Attempt one exact native task revision transition. */
export default async function moveTask(task: TaskView, status: TaskStatus):Promise<UpdateTaskResult>{
 return ownedTaskBoard.transition(task.task.id, status);
}
