import {gadHealth} from "natlang:services";
import type {ChannelHealth} from "../../types.js";
/** Observe one compact GAD health snapshot for the assigned channel. */
export default async function readHealth(operationId: string):Promise<ChannelHealth>{
 return gadHealth.observe(operationId);
}
