import {contentProjectSources} from "natlang:services";
import type {ProjectEvidenceReview} from "../types.js";
/** Read the exact current and retired owned project evidence coordinates. */
export default async function readOwnedProjectSources():Promise<ProjectEvidenceReview>{
 return contentProjectSources.observe();
}
