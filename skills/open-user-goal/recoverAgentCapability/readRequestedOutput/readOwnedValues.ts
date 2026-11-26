import {agentCapabilityEvidence} from "natlang:services";
import type {ActionEvidence,RetainedNotebookValue} from "../types.js";
/** Read only the actual inspected owner-bound native notebook value tuple. */
export default function readOwnedValues(evidence:ActionEvidence):Promise<RetainedNotebookValue[]|null>{
 return agentCapabilityEvidence.readRetainedValues(evidence.attempt.id,evidence.resultDigest,evidence.notebook.revision);
}
