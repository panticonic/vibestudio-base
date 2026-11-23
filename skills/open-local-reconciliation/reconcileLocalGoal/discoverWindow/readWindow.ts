import {reconciliationWindow} from "natlang:services";
import type {ReviewWindow} from "../../types.js";
/** Read the current owned approval record and working revision. */
export default async function readWindow():Promise<ReviewWindow>{
 return reconciliationWindow.read();
}
