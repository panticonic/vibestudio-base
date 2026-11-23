import {ownedTaskHandoff} from "natlang:services";
import type {HandoffAttempt, LaneObservation, TaskView} from "../../types.js";
/** Submit one authorized note against the current task revision and native recipient snapshot. */
export default async function submitNote(task: TaskView, lane: LaneObservation, body: string):Promise<HandoffAttempt>{
 return ownedTaskHandoff.submit(task.task.id, lane.basis, body);
}
