import {adoptionReview} from "natlang:services";
import type {AdoptionComposition} from "../../types.js";
/** Run the native template ownership, manifest and closure mechanisms against the exact staged event. */
export default async function simulateOwnedComposition(id: string, event: string):Promise<AdoptionComposition>{
 return adoptionReview.compose(id, event);
}
