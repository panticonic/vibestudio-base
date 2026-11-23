import {retainedProviderOutput} from "natlang:services";
import type {OutputReadback} from "./types.js";
/** Read original cached data for the selected committed in-scope provider result. */
export default async function readProviderOutput(channelId: string, resultMessage: string):Promise<OutputReadback | null>{
 return retainedProviderOutput.read(channelId, resultMessage);
}
