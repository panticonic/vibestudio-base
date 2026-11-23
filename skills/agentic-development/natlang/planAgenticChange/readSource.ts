import {agenticChangeSource} from "natlang:services";
import type {AgenticSourceObservation} from "../types.js";
/** Read the installed agentic stack guides at the assigned context's current working head. */
export default async function readSource(contextId: string):Promise<AgenticSourceObservation>{
 return agenticChangeSource.read(contextId);
}
