import {mobileContinuity} from "natlang:services";
import type {MobileContinuityCard} from "../../types.js";
/** List the exact assigned local mobile records. */
export default async function listProfiles():Promise<MobileContinuityCard[]>{
 return mobileContinuity.discover();
}
