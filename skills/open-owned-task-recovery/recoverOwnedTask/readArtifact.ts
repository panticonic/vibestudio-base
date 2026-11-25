import {ownedTaskAttempts} from "natlang:services";
import type {TaskView,LaneObservation,TaskArtifact} from "../types.js";
/** Read retained output through the actual current assignment and inspected receipt. */
export default async function readArtifact(current:TaskView,lane:LaneObservation):Promise<TaskArtifact>{
 return ownedTaskAttempts.readArtifact(current.task.id,current.revision,lane.lane.id,lane.basis);
}
