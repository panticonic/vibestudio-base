import {adoptionReview} from "natlang:services";
import type {AdoptionReadback} from "../types.js";
/** Reread the exact current review and the newly recorded local artifact, if any. */
export default async function readAdoptionHandoff(id: string, path: string | null):Promise<AdoptionReadback>{
 return adoptionReview.readback(id, path);
}
