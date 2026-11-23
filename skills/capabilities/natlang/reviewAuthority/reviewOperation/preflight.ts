import {assignedAuthorityRead} from "natlang:services";
import type {AuthorityObservation} from "../../types.js";
/** Dry-run a single caller-bound operation in the live Vibestudio authority service. */
export default async function preflight(operationId: string):Promise<AuthorityObservation>{
 return assignedAuthorityRead.preflight(operationId);
}
