import {terminalEvidenceRead} from "natlang:services";
import type {TerminalOperationEvidence} from "../../types.js";
/** Retrieve only the assigned terminal receipt and its result metadata. */
export default async function readTerminalEvidence(operationId: string):Promise<TerminalOperationEvidence>{
 return terminalEvidenceRead.inspect(operationId);
}
