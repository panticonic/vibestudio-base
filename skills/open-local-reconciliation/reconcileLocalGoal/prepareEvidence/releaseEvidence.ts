import {reconciliationWindow} from "natlang:services";
import type {EvidenceRequest} from "../../types.js";
/** Request an exact source-and-question assignment for the verified local revision. */
export default async function releaseEvidence(head: string):Promise<EvidenceRequest | null>{
 return reconciliationWindow.release(head);
}
