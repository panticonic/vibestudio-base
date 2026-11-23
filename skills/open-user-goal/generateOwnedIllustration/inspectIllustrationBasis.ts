import readCurrentImagePlan from "./inspectIllustrationBasis/readCurrentImagePlan.js";
import type {IllustrationAssignment,IllustrationBasis} from "./types.js";
export default async function inspectIllustrationBasis(assignment:IllustrationAssignment):Promise<IllustrationBasis>{return readCurrentImagePlan(assignment);}
