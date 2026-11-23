import {mobileContinuity} from "natlang:services";
import type {MobileContinuityProfile} from "../../types.js";
/** Read one discovered owned mobile record. */
export default async function readProfile(id: string):Promise<MobileContinuityProfile>{
 return mobileContinuity.profile(id);
}
