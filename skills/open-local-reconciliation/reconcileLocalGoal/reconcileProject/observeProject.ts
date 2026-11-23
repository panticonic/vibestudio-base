import {reconciliationNative} from "natlang:services";
import type {ReconcileView} from "../../types.js";
/** Read the assigned base, working and incoming file values plus currently valid merge choices. */
export default async function observeProject():Promise<ReconcileView>{
 return reconciliationNative.observe();
}
