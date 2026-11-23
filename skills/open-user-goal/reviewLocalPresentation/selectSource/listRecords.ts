import {presentationRecords} from "natlang:services";
import type {PresentationSourceCard} from "../../types.js";
/** Discover the candidate record identities in the owned workspace. */
export default async function listRecords():Promise<PresentationSourceCard[]>{
 return presentationRecords.discover();
}
