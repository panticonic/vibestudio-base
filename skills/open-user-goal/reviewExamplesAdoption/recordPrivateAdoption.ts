import {adoptionHandoff} from "natlang:services";
import type {AdoptionPlan, AdoptionReceipt} from "../types.js";
/** Record one private adoption handoff bound to the exact confirmed review state. */
export default async function recordPrivateAdoption(id: string, event: string, plan: AdoptionPlan):Promise<AdoptionReceipt | null>{
 return adoptionHandoff.record(id, event, plan);
}
