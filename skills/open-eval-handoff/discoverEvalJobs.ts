import {openEvalCatalog} from "natlang:services";
import type {EvalJobCard} from "./types.js";
/** Discover work and its existing caller-owned eval attempts. */
export default async function discoverEvalJobs():Promise<EvalJobCard[]>{
 return openEvalCatalog.discover();
}
