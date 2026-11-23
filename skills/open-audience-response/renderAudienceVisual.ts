import {nativeAudienceResponse} from "natlang:services";
import type {AudiencePrepared, AudienceReceipt} from "./types.js";
/** Render only the exact authorized presentation from the current owned record. */
export default async function renderAudienceVisual(recordId: string, revision: string, prepared: AudiencePrepared):Promise<AudienceReceipt | null>{
 return nativeAudienceResponse.render(recordId, revision, prepared);
}
