import {quietIntegrationProtocol} from "natlang:services";
import type {QuietRequest} from "./types.js";
/** Open one exact currently trusted plan in pregranted-only mode. */
export default async function openQuietIntegrationPlan(profileId: string, message: string):Promise<QuietRequest | null>{
 return quietIntegrationProtocol.open(profileId, message);
}
