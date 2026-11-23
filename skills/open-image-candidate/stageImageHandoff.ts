import {imageCandidateHandoff} from "natlang:services";
import type {ImageHandoff, ImageReport} from "./types.js";
/** Write the authorized private scratch handoff for the selected verified candidate. */
export default async function stageImageHandoff(report: ImageReport):Promise<ImageHandoff | null>{
 return imageCandidateHandoff.stage(report);
}
