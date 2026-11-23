import {ownedTaskBoard} from "natlang:services";
import type {TaskView} from "../../types.js";
/** Read the actual revision, owner, attempt and dependencies of an observed card. */
export default async function readTask(id: string):Promise<TaskView>{
 return ownedTaskBoard.observe(id);
}
