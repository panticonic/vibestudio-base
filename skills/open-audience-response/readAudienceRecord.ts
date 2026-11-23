import {nativeAudienceResponse} from "natlang:services";
import type {AudienceRecord} from "./types.js";
/** Read the exact owned decision sheet and available evidence. */
export default async function readAudienceRecord():Promise<AudienceRecord>{
 return nativeAudienceResponse.readRecord();
}
