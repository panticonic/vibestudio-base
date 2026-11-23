import {localMethodDispatch} from "natlang:services";
import type {LocalMethodAttempt, LocalMethodKind} from "../types.js";
/** Start the exact assigned native method once in the owned channel. */
export default async function dispatchOwnedLocalMethod(id: string, basis: string, method: LocalMethodKind):Promise<LocalMethodAttempt>{
 return localMethodDispatch.request(id, basis, method);
}
