import {localMethodRead} from "natlang:services";
import type {LocalMethodEvidence} from "../../types.js";
/** Read joined local provider ownership and any authoritative retained terminal. */
export default async function inspectOwnedMethodLane(id: string):Promise<LocalMethodEvidence>{
 return localMethodRead.inspect(id);
}
