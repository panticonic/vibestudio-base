import {gadFollowUp} from "natlang:services";
import type {ChannelFollowUp} from "../types.js";
/** Read the dedicated diagnostic for one observed finding. */
export default async function inspectFinding(healthReceipt: string, kind: string):Promise<ChannelFollowUp>{
 return gadFollowUp.inspect(healthReceipt, kind);
}
