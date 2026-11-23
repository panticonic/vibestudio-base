import {adoptionReview} from "natlang:services";
import type {AdoptionGate} from "../types.js";
/** Recheck the current owned review event and protected workspace. */
export default async function confirmAdoptionFrontier(id: string, event: string):Promise<AdoptionGate>{
 return adoptionReview.confirm(id, event);
}
