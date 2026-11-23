import {mobileContinuity} from "natlang:services";
import type {MobileCacheEvidence} from "../../types.js";
/** Read exact fixture-scoped mobile cache evidence. */
export default async function readCache(id: string):Promise<MobileCacheEvidence>{
 return mobileContinuity.cache(id);
}
