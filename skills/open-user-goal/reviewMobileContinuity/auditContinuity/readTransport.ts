import {mobileContinuity} from "natlang:services";
import type {MobileTransportEvidence} from "../../types.js";
/** Read exact fixture-scoped mobile transport evidence. */
export default async function readTransport(id: string):Promise<MobileTransportEvidence>{
 return mobileContinuity.transport(id);
}
