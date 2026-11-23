import {illustrationEvidence} from "natlang:services";
import type {IllustrationAssignment} from "./types.js";
/** Discover the user goal, native request scope and approved output format. */
export default async function discoverIllustration():Promise<IllustrationAssignment>{
 return illustrationEvidence.discover();
}
