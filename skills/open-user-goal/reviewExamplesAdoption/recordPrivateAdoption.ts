import {adoptionHandoff} from "natlang:services";
import type {AdoptionNoteDraft, AdoptionReceipt} from "../types.js";
/** Record one private adoption handoff bound to the exact confirmed review state. */
export default async function recordPrivateAdoption(id: string, event: string, draft: AdoptionNoteDraft):Promise<AdoptionReceipt | null>{
 return adoptionHandoff.record(id, event, draft);
}
