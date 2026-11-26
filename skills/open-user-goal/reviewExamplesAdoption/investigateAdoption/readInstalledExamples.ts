import {adoptionReview} from "natlang:services";
import type {AdoptionInstalled} from "../../types.js";
/** Read the exact installed Examples manifest and relevant package. */
export default async function readInstalledExamples(id: string):Promise<AdoptionInstalled>{
 return adoptionReview.installed(id);
}
