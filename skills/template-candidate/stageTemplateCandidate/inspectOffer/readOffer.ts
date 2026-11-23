import {templateOffer} from "natlang:services";
import type {CandidateOffer} from "../../types.js";
/** Read cached discovery for the caller's assigned workspace template. */
export default async function readOffer():Promise<CandidateOffer | null>{
 return templateOffer.read();
}
