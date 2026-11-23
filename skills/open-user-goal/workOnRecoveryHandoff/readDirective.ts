import {recoveryHandoffLink} from "natlang:services";
import type {RecoveryHandoffDirective} from "./types.js";
/** Read the exact current owner directive and local recipient. */
export default async function readDirective():Promise<RecoveryHandoffDirective>{
 return recoveryHandoffLink.discover();
}
